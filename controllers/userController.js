const User = require("../models/User");
const bcrypt = require("bcrypt");
const { uploadBufferToCloudinary, cloudinary } = require("../utils/upload");
const Notification = require("../models/Notification");

function emitToUser(req, userId, event, payload) {
  const io = req.app?.locals?.io;
  if (io && userId) {
    io.to(String(userId)).emit(event, payload);
  }
}

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-passwordHash").lean();
    if (!user) return res.status(400).json({ msg: "User not found" });
    return res.json({ user });
  } catch (err) {
    console.error("getUserById error", err);
    return res.status(500).json({ msg: "Server Error" });
  }
};

exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash").lean();
    if (!user) return res.status(404).json({ msg: "User not found" });
    return res.json({ user });
  } catch (err) {
    console.error("getMyProfile error", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.updateMyProfile = async (req, res) => {
  try {
    const updates = {};
    const { name, bio, interests, profilePicUrl, password, currentPassword } = req.body;

    const userExisting = await User.findById(req.user.id);
    if (!userExisting) return res.status(404).json({ msg: "User not found" });

    if (name) updates.name = String(name).trim();
    if (bio !== undefined) updates.bio = bio;
    if (req.body.location !== undefined) updates.location = req.body.location;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (profilePicUrl !== undefined) updates.profilePicUrl = profilePicUrl; // possibly external URL

    if (interests) {
      updates.interests = Array.isArray(interests)
        ? interests
        : String(interests).split(",").map((i) => i.trim()).filter(Boolean);
    }

    if (req.body.notificationPreferences) {
      let prefs = req.body.notificationPreferences;
      if (typeof prefs === 'string') {
        try { prefs = JSON.parse(prefs); } catch (e) { }
      }
      updates.notificationPreferences = {
        ...userExisting.notificationPreferences,
        ...prefs
      };
    }

    if (password) {
      if (!currentPassword) {
        return res.status(400).json({ msg: "Current Password required to change the password" });
      }
      const isMatch = await bcrypt.compare(currentPassword, userExisting.passwordHash);
      if (!isMatch) return res.status(400).json({ msg: "Current password is incorrect" });
      const salt = await bcrypt.genSalt(10);
      updates.passwordHash = await bcrypt.hash(password, salt);
    }

    if (req.file && req.file.buffer) {
      try {
        const options = { folder: "wellness/profiles", resource_type: "image" };
        const result = await uploadBufferToCloudinary(req.file.buffer, options);
        if (userExisting.profilePicPublicId) {
          try {
            await cloudinary.uploader.destroy(userExisting.profilePicPublicId);
          } catch (delErr) {
            console.warn("Failed to delete old Cloudinary asset:", delErr.message || delErr);
          }
        }

        updates.profilePicUrl = result.secure_url;
        updates.profilePicPublicId = result.public_id;
      } catch (err) {
        console.error("Cloudinary upload failed", err);
        return res.status(500).json({ msg: "Image upload failed" });
      }
    } else if (profilePicUrl !== undefined && userExisting.profilePicPublicId) {
      try {
        await cloudinary.uploader.destroy(userExisting.profilePicPublicId);
      } catch (delErr) {
        console.warn("Failed to delete old Cloudinary asset:", delErr.message || delErr);
      }
      updates.profilePicPublicId = null;
    }

    const updated = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select("-passwordHash").lean();
    return res.json({ user: updated });
  } catch (err) {
    console.error("UpdateMyProfileError", err);
    return res.status(500).json({ msg: "server error" });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const q = String(req.query.search || "").trim();
    const limit = Math.min(50, parseInt(req.query.limit || "10", 10));

    const filter = {};
    if (q) {
      // Escape special characters for regex
      const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escapedQ, $options: "i" } },
        { email: { $regex: escapedQ, $options: "i" } }
      ];
    }
    const users = await User.find(filter).select("name email profilePicUrl bio").limit(limit).lean();
    return res.json({ users });
  } catch (err) {
    console.error("search user error", err);
    return res.status(500).json({ msg: "Server Error" });
  }
};

exports.toggleFollow = async (req, res) => {
  try {
    const targetId = req.params.id;
    const meId = req.user.id;

    if (targetId === meId) return res.status(400).json({ msg: "Cannot follow yourself" });

    const targetUser = await User.findById(targetId);
    if (!targetUser) return res.status(404).json({ msg: "User not found" });

    const me = await User.findById(meId);

    // Ensure arrays exist
    targetUser.followers = targetUser.followers || [];
    targetUser.followRequests = targetUser.followRequests || [];
    me.following = me.following || [];
    me.sentRequests = me.sentRequests || [];

    const isFollowing = targetUser.followers.some(id => id.toString() === meId);
    const isRequested = targetUser.followRequests.some(id => id.toString() === meId);

    if (isFollowing) {
      // Unfollow
      targetUser.followers = targetUser.followers.filter(id => id.toString() !== meId);
      me.following = me.following.filter(id => id.toString() !== targetId);
      await targetUser.save();
      await me.save();
      emitToUser(req, targetId, 'followRequestUpdated', { type: 'unfollowed', userId: meId });
      emitToUser(req, meId, 'followRequestUpdated', { type: 'unfollowed', userId: targetId });
      return res.json({ status: 'unfollowed', msg: 'Unfollowed user' });
    } else if (isRequested) {
      // Cancel request
      targetUser.followRequests = targetUser.followRequests.filter(id => id.toString() !== meId);
      me.sentRequests = me.sentRequests.filter(id => id.toString() !== targetId);
      await targetUser.save();
      await me.save();
      emitToUser(req, targetId, 'followRequestUpdated', { type: 'cancelled', userId: meId });
      emitToUser(req, meId, 'followRequestUpdated', { type: 'cancelled', userId: targetId });
      return res.json({ status: 'cancelled', msg: 'Follow request cancelled' });
    } else {
      // Send request
      targetUser.followRequests.push(meId);
      me.sentRequests.push(targetId);
      await targetUser.save();
      await me.save();

      const followRequestNotification = await Notification.create({
        recipient: targetId,
        sender: meId,
        type: 'follow_request',
        isRead: false
      });

      const populatedNotif = await followRequestNotification.populate('sender', 'name profilePicUrl');
      emitToUser(req, targetId, 'newNotification', populatedNotif);
      emitToUser(req, targetId, 'followRequestUpdated', { type: 'requested', userId: meId });
      emitToUser(req, meId, 'followRequestUpdated', { type: 'requested', userId: targetId });
      return res.json({ status: 'requested', msg: 'Follow request sent' });
    }
  } catch (err) {
    console.error("toggleFollow error", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.acceptFollowRequest = async (req, res) => {
  try {
    const requesterId = req.params.id;
    const meId = req.user.id; // I am the one accepting

    const me = await User.findById(meId);
    const requester = await User.findById(requesterId);

    if (!requester) return res.status(404).json({ msg: "User not found" });

    // Check if request exists
    if (!me.followRequests.some(id => id.toString() === requesterId)) {
      return res.status(400).json({ msg: "No follow request from this user" });
    }

    // Move from requests to followers
    me.followRequests = me.followRequests.filter(id => id.toString() !== requesterId);
    me.followers.push(requesterId);

    // Update requester's following and sentRequests
    requester.sentRequests = requester.sentRequests.filter(id => id.toString() !== meId);
    requester.following.push(meId);

    await me.save();
    await requester.save();

    const followAcceptedNotification = await Notification.create({
      recipient: requesterId,
      sender: meId,
      type: 'follow',
      isRead: false
    });
    const populatedNotif = await followAcceptedNotification.populate('sender', 'name profilePicUrl');

    emitToUser(req, requesterId, 'newNotification', populatedNotif);
    emitToUser(req, requesterId, 'followRequestUpdated', { type: 'accepted', userId: meId });
    emitToUser(req, meId, 'followRequestUpdated', { type: 'accepted', userId: requesterId });

    return res.json({ msg: "Request accepted" });
  } catch (err) {
    console.error("acceptFollowRequest error", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.rejectFollowRequest = async (req, res) => {
  try {
    const requesterId = req.params.id;
    const meId = req.user.id;

    const me = await User.findById(meId);
    const requester = await User.findById(requesterId);

    if (!requester) return res.status(404).json({ msg: "User not found" });

    // Remove from requests
    me.followRequests = me.followRequests.filter(id => id.toString() !== requesterId);

    // Remove from requester's sentRequests
    requester.sentRequests = requester.sentRequests.filter(id => id.toString() !== meId);

    await me.save();
    await requester.save();

    emitToUser(req, requesterId, 'followRequestUpdated', { type: 'rejected', userId: meId });
    emitToUser(req, meId, 'followRequestUpdated', { type: 'rejected', userId: requesterId });

    return res.json({ msg: "Request rejected" });
  } catch (err) {
    console.error("rejectFollowRequest error", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.getFollowRequests = async (req, res) => {
  try {
    const me = await User.findById(req.user.id)
      .populate('followRequests', 'name profilePicUrl bio')
      .lean();

    return res.json({ requests: me.followRequests || [] });
  } catch (err) {
    console.error("getFollowRequests error", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.toggleFavorite = async (req, res) => {
  try {
    const postId = req.params.postId;
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ msg: "User not found" });

    // Ensure favorites array exists
    user.favorites = user.favorites || [];

    const index = user.favorites.findIndex(id => id.toString() === postId);
    let isFavorited = false;

    if (index === -1) {
      user.favorites.push(postId);
      isFavorited = true;
    } else {
      user.favorites.splice(index, 1);
      isFavorited = false;
    }

    await user.save();
    return res.json({ isFavorited, favorites: user.favorites });
  } catch (err) {
    console.error("toggleFavorite error", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.getFavorites = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'favorites',
      populate: { path: 'author', select: 'name profilePicUrl' }
    }).lean();

    if (!user) return res.status(404).json({ msg: "User not found" });

    // Filter out nulls (deleted posts)
    const favorites = (user.favorites || []).filter(post => post !== null);
    return res.json({ favorites });
  } catch (err) {
    console.error("getFavorites error", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.getUserConnections = async (req, res) => {
  try {
    const userId = req.params.id || req.user.id;
    const type = req.query.type || 'followers'; // 'followers' or 'following'

    const user = await User.findById(userId).populate(type, 'name profilePicUrl bio').lean();

    if (!user) return res.status(404).json({ msg: "User not found" });

    return res.json({ users: user[type] || [] });
  } catch (err) {
    console.error("getUserConnections error", err);
    return res.status(500).json({ msg: "Server error" });
  }
};
