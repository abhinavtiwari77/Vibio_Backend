const Community = require('../models/Community');
const User = require('../models/User');
const slugify = require('slugify'); // tiny helper

function makeSlug(name) {
  try {
    return slugify(name, { lower: true, strict: true });
  } catch (err) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
}


exports.createCommunity = async (req, res) => {
  try {
    const { name, description, isPrivate } = req.body;
    if (!name) return res.status(400).json({ msg: 'Name required' });

    const slug = makeSlug(name);
    let finalSlug = slug;
    let counter = 1;
    while (await Community.findOne({ slug: finalSlug })) {
      finalSlug = `${slug}-${counter++}`;
    }

    const community = await Community.create({
      name: String(name).trim(),
      slug: finalSlug,
      description: description || '',
      isPrivate: !!isPrivate,
      members: [req.user.id],
      admins: [req.user.id]
    });

    return res.status(201).json({ community });
  } catch (err) {
    console.error('createCommunity error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};


exports.listCommunities = async (req, res) => {
  try {
    const q = String(req.query.search || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, parseInt(req.query.limit || '10', 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { slug: { $regex: q, $options: 'i' } }
      ];
    }

    const total = await Community.countDocuments(filter);
    const communities = await Community.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-pendingRequests')
      .lean();

    return res.json({ page, limit, total, communities });
  } catch (err) {
    console.error('listCommunities error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.getCommunity = async (req, res) => {
  try {
    const idOrSlug = req.params.identifier;
    const query = mongooseIdPattern(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
    const community = await Community.findOne(query)
      .populate('members', 'name profilePicUrl')
      .populate('admins', 'name profilePicUrl')
      .populate('pendingRequests', 'name profilePicUrl')
      .lean();
    if (!community) return res.status(404).json({ msg: 'Community not found' });

    // Hide pending requests from non-admins
    if (!req.user) {
      delete community.pendingRequests;
    } else {
      const isAdmin = community.admins.some(a => {
        const adminId = typeof a === 'string' ? a : a._id;
        return adminId.toString() === req.user.id;
      });
      if (!isAdmin) {
        delete community.pendingRequests;
      }
    }

    return res.json({ community });
  } catch (err) {
    console.error('getCommunity error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

function mongooseIdPattern(str) {
  return /^[a-f\d]{24}$/i.test(str);
}


exports.joinCommunity = async (req, res) => {
  try {
    const id = req.params.id;
    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ msg: 'Community not found' });

    const me = req.user.id;

    if (community.members.some(m => m.toString() === me)) {
      return res.status(400).json({ msg: 'Already a member' });
    }

    if (community.isPrivate) {
      if (community.pendingRequests.some(p => p.toString() === me)) {
        return res.status(400).json({ msg: 'Join request already pending' });
      }
      community.pendingRequests.push(me);
      await community.save();
      return res.json({ msg: 'Join request submitted' });
    }

    community.members.push(me);
    await community.save();
    return res.json({ msg: 'Joined community' });
  } catch (err) {
    console.error('joinCommunity error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};


exports.leaveCommunity = async (req, res) => {
  try {
    const id = req.params.id;
    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ msg: 'Community not found' });

    const me = req.user.id;

    if (!community.members.some(m => m.toString() === me)) {
      return res.status(400).json({ msg: 'Not a member' });
    }

    community.members = community.members.filter(m => m.toString() !== me);

    community.admins = community.admins.filter(a => a.toString() !== me);
    await community.save();

    return res.json({ msg: 'Left community' });
  } catch (err) {
    console.error('leaveCommunity error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.approveRequest = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ msg: 'Community not found' });

    if (!community.admins.some(a => a.toString() === req.user.id)) {
      return res.status(403).json({ msg: 'Only community admins can approve requests' });
    }

    if (!community.pendingRequests.some(p => p.toString() === userId)) {
      return res.status(400).json({ msg: 'No such pending request' });
    }

    community.members.push(userId);
    community.pendingRequests = community.pendingRequests.filter(p => p.toString() !== userId);
    await community.save();

    return res.json({ msg: 'User added to community' });
  } catch (err) {
    console.error('approveRequest error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ msg: 'Community not found' });

    if (!community.admins.some(a => a.toString() === req.user.id)) {
      return res.status(403).json({ msg: 'Only community admins can reject requests' });
    }

    if (!community.pendingRequests.some(p => p.toString() === userId)) {
      return res.status(400).json({ msg: 'No such pending request' });
    }

    community.pendingRequests = community.pendingRequests.filter(p => p.toString() !== userId);
    await community.save();

    return res.json({ msg: 'Request rejected' });
  } catch (err) {
    console.error('rejectRequest error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.updateCommunity = async (req, res) => {
  try {
    const id = req.params.id;
    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ msg: 'Community not found' });

    if (!community.admins.some(a => a.toString() === req.user.id)) {
      return res.status(403).json({ msg: 'Only community admins can update' });
    }

    const { name, description, isPrivate } = req.body;
    if (name && name !== community.name) {
      const slug = makeSlug(name);
      let finalSlug = slug;
      let counter = 1;
      while (await Community.findOne({ slug: finalSlug, _id: { $ne: community._id } })) {
        finalSlug = `${slug}-${counter++}`;
      }
      community.name = name;
      community.slug = finalSlug;
    }

    if (description !== undefined) community.description = description;
    if (typeof isPrivate === 'boolean') community.isPrivate = isPrivate;

    await community.save();
    return res.json({ community });
  } catch (err) {
    console.error('updateCommunity error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.deleteCommunity = async (req, res) => {
  try {
    const id = req.params.id;
    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ msg: 'Community not found' });

    if (!community.admins.some(a => a.toString() === req.user.id)) {
      return res.status(403).json({ msg: 'Only community admins can delete' });
    }

    await community.deleteOne();
    return res.json({ msg: 'Community deleted' });
  } catch (err) {
    console.error('deleteCommunity error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ msg: 'Community not found' });

    if (!community.admins.some(a => a.toString() === req.user.id)) {
      return res.status(403).json({ msg: 'Only admins can remove members' });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ msg: 'Cannot remove yourself (use leave)' });
    }

    community.members = community.members.filter(m => m.toString() !== userId);
    community.admins = community.admins.filter(a => a.toString() !== userId);
    await community.save();

    return res.json({ msg: 'Member removed' });
  } catch (err) {
    console.error('removeMember error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.getPendingCommunityRequests = async (req, res) => {
  try {
    const communities = await Community.find({
      admins: req.user.id,
      pendingRequests: { $exists: true, $not: { $size: 0 } }
    })
      .select('name pendingRequests slug')
      .populate('pendingRequests', 'name profilePicUrl')
      .lean();

    // Flatten logic if needed, or return grouped
    return res.json({ communities });
  } catch (err) {
    console.error('getPendingCommunityRequests error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};
