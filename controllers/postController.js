const Post = require("../models/Post");
const User = require("../models/User");
const { uploadBufferToCloudinary, cloudinary } = require("../utils/upload");

function parseMediaEdits(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  try {
    return JSON.parse(input);
  } catch (e) {
    return [];
  }
}

function normalizeRatio(value) {
  if (typeof value !== 'string') return 'original';
  const trimmed = value.trim();
  if (trimmed === 'original') return 'original';
  return /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(trimmed) ? trimmed : 'original';
}

function getEditForFile(file, index, mediaEdits, usedIndexes) {
  if (!Array.isArray(mediaEdits) || mediaEdits.length === 0) return {};

  const byIdentityIndex = mediaEdits.findIndex((edit, editIdx) => {
    if (usedIndexes.has(editIdx)) return false;
    return edit &&
      edit.fileName === file.originalname &&
      edit.fileType === file.mimetype &&
      Number(edit.fileSize || 0) === Number(file.size || 0);
  });

  if (byIdentityIndex !== -1) {
    usedIndexes.add(byIdentityIndex);
    return mediaEdits[byIdentityIndex] || {};
  }

  if (mediaEdits[index] && !usedIndexes.has(index)) {
    usedIndexes.add(index);
    return mediaEdits[index] || {};
  }

  const firstUnused = mediaEdits.findIndex((_, editIdx) => !usedIndexes.has(editIdx));
  if (firstUnused !== -1) {
    usedIndexes.add(firstUnused);
    return mediaEdits[firstUnused] || {};
  }

  return {};
}

function buildTransformedUrl({ publicId, isVideo, size }) {
  const numericSize = size && size !== 'original' ? parseInt(size, 10) : null;

  if (!numericSize) return null;

  const transformation = {};
  if (numericSize && Number.isFinite(numericSize)) {
    transformation.width = numericSize;
    transformation.crop = 'limit';
  }

  if (isVideo) transformation.quality = 'auto';

  return cloudinary.url(publicId, {
    secure: true,
    resource_type: isVideo ? 'video' : 'image',
    transformation: [transformation]
  });
}

async function uploadFilesToCloudinary(files = [], mediaEdits = []) {
  const uploaded = [];
  const usedEditIndexes = new Set();
  for (let i = 0; i < files.length; i += 1) {
    const f = files[i];
    const isVideo = f.mimetype.startsWith('video/');
    const edit = getEditForFile(f, i, mediaEdits, usedEditIndexes);
    const ratio = normalizeRatio(edit.ratio);
    const size = edit.size || 'original';
    const fitMode = 'contain';

    const options = {
      folder: 'wellness/posts',
      resource_type: isVideo ? 'video' : 'image',
      use_filename: true,
      unique_filename: true
    };
    const res = await uploadBufferToCloudinary(f.buffer, options);

    const transformedUrl = buildTransformedUrl({
      publicId: res.public_id,
      isVideo,
      size
    });

    const normalizedOriginalRatio = normalizeRatio(edit.originalRatio);
    const fallbackOriginalRatio = normalizedOriginalRatio !== 'original'
      ? normalizedOriginalRatio
      : 'original';

    const resolvedAspectRatio = ratio === 'original'
      ? (res.width && res.height ? `${res.width}:${res.height}` : fallbackOriginalRatio)
      : ratio;

    uploaded.push({
      url: transformedUrl || res.secure_url,
      original_url: res.secure_url,
      public_id: res.public_id,
      resource_type: isVideo ? 'video' : 'image',
      aspectRatio: resolvedAspectRatio,
      fitMode,
      width: res.width || null,
      height: res.height || null
    });
  }
  return uploaded;
}

const Notification = require("../models/Notification");

exports.createPost = async (req, res) => {
  try {
    let { content, mediaUrl, community, mediaEdits } = req.body;
    let media = [];
    const parsedEdits = parseMediaEdits(mediaEdits);

    if (Array.isArray(req.files) && req.files.length > 0) {
      try {
        const uploaded = await uploadFilesToCloudinary(req.files, parsedEdits);
        media = uploaded;
      } catch (err) {
        console.error("Cloudinary upload failed", err);
        return res.status(500).json({ msg: "Image/Video upload failed" });
      }
    }

    if (!content && !mediaUrl && media.length === 0) {
      return res.status(400).json({ msg: "Post must have content or media" });
    }

    if (mediaUrl) {
      media.push({
        url: mediaUrl,
        public_id: null,
        resource_type: mediaUrl.match(/\.(mp4|mov|webm)$/i) ? 'video' : 'image'
      });
    }

    const post = await Post.create({
      author: req.user.id,
      content,
      media,
      mediaUrl: media.length > 0 ? media[0].url : null,
      community: community || null
    });

    await post.populate("author", "name profilePicUrl");

    // NOTIFICATION LOGIC
    try {
      const authorId = req.user.id;
      // Find all users who follow this author
      // Since User model has 'followers' array, we can fetch the user and populate followers 
      // OR just query Users where 'following' includes authorId (if that field exists and is maintained)
      // The User model has 'followers' array which contains ObjectIds of followers.

      const author = await User.findById(authorId);
      if (author && author.followers && author.followers.length > 0) {
        const notifications = author.followers.map(followerId => ({
          recipient: followerId,
          sender: authorId,
          type: 'new_post',
          post: post._id,
          isRead: false
        }));

        if (notifications.length > 0) {
          const inserted = await Notification.insertMany(notifications);

          // Emit socket events
          const io = req.app.locals.io;
          if (io) {
            inserted.forEach(notif => {
              // We emit to the specific user's room or socket if we track it.
              // Server tracks onlineUsers by userId -> socketId.
              // But standard practice is to join user to a room named after their ID? 
              // Looking at server.js, onlineUsers is a Map.
              // We can emit to specific socket ID if online.

              // However, simpler pattern often used is `io.to(userId).emit` if we have rooms setup.
              // server.js doesn't seem to join users to 'userId' room automatically on connection, 
              // BUT it does have `onlineUsers`.

              // Let's modify server.js to join user to their own room, OR use the map.
              // Accessing Map from here via app.locals is possible if we exposed the Map?
              // `app.locals.io` is exposed. `onlineUsers` map is NOT exposed.

              // Best bet: Emit a general event and let client filter? No, inefficient.
              // Let's update server.js later to join user room.
              // For now, I'll assumme I can iterate or just emit to all (bad).
              // Wait, I can loop through onlineUsers if I expose it.

              // Actually, I should update server.js first to make sure I can target users efficiently.
              // But for now, let's just put the logic here assuming I WILL fix server.js to join `userId` room.
              io.to(notif.recipient.toString()).emit('newNotification', notif);
            });
          }
        }
      }
    } catch (notifError) {
      console.error("Error creating notifications:", notifError);
      // Don't fail the post creation if notifications fail
    }

    return res.status(201).json({ post });
  } catch (err) {
    console.error("createPost error", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.editPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const me = req.user.id;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ msg: "Post not found" });

    if (post.author.toString() !== me && !req.user.isAdmin) {
      return res.status(403).json({ msg: "Not allowed" });
    }

    const { content, removePublicIds, mediaEdits } = req.body;
    const parsedEdits = parseMediaEdits(mediaEdits);
    let removeIds = [];
    try {
      if (removePublicIds) {
        if (typeof removePublicIds === 'string') {
          removeIds = JSON.parse(removePublicIds);
        } else {
          removeIds = Array.isArray(removePublicIds) ? removePublicIds : [];
        }
      }
    } catch (e) {
      removeIds = [];
    }

    if (Array.isArray(removeIds) && removeIds.length > 0) {
      for (const pid of removeIds) {
        const idx = post.media.findIndex(m => m.public_id === pid);
        if (idx !== -1) {
          const mediaItem = post.media[idx];
          try {
            await cloudinary.uploader.destroy(mediaItem.public_id, { resource_type: mediaItem.resource_type || 'image' });
          } catch (err) {
            console.warn('Failed to delete cloud asset', mediaItem.public_id, err.message || err);
          }
          // remove from array
          post.media.splice(idx, 1);
        }
      }
    }
    if (Array.isArray(req.files) && req.files.length > 0) {
      try {
        const uploaded = await uploadFilesToCloudinary(req.files, parsedEdits);
        post.media.push(...uploaded);
      } catch (err) {
        console.error('Cloudinary upload failed', err);
        return res.status(500).json({ msg: 'Image/Video upload failed' });
      }
    }

    if (typeof content === 'string') post.content = content;

    post.mediaUrl = post.media.length > 0 ? post.media[0].url : null;

    await post.save();
    await post.populate('author', 'name profilePicUrl');

    return res.json({ post });
  } catch (err) {
    console.error('editPost error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ msg: 'Post not found' });

    if (post.author.toString() !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ msg: 'Not allowed' });
    }
    if (Array.isArray(post.media) && post.media.length > 0) {
      for (const m of post.media) {
        if (m.public_id) {
          try {
            await cloudinary.uploader.destroy(m.public_id, { resource_type: m.resource_type || 'image' });
          } catch (err) {
            console.warn('Failed to delete asset:', m.public_id, err.message || err);
          }
        }
      }
    }

    await post.deleteOne();
    return res.json({ msg: 'Post Deleted' });
  } catch (err) {
    console.error('deletePost error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.getFeed = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, parseInt(req.query.limit || '10', 10));
    const skip = (page - 1) * limit;
    const { community, author } = req.query;

    const filter = {};
    if (community) filter.community = community;
    if (author) filter.author = author;

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name profilePicUrl')
      .lean();

    const total = await Post.countDocuments(filter);
    return res.json({ page, limit, total, posts });
  } catch (err) {
    console.error('getFeed error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate('author', 'name profilePicUrl').lean();
    if (!post) return res.status(404).json({ msg: 'Post not found' });
    return res.json({ post });
  } catch (err) {
    console.error('getPost error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.toggleLike = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ msg: 'Post not found' });

    const userId = req.user.id;
    const idx = post.likes.findIndex((id) => id.toString() === userId);

    if (idx === -1) {
      post.likes.push(userId);
    } else {
      post.likes.splice(idx, 1);
    }

    await post.save();
    return res.json({ likesCount: post.likes.length, liked: idx === -1 });
  } catch (err) {
    console.error('toggleLike error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};
