const mongoose = require('mongoose');

const MediaSchema = new mongoose.Schema({
  url: { type: String, required: true },
  original_url: { type: String, default: null },
  public_id: { type: String, required: true },
  resource_type: { type: String, enum: ['image', 'video', 'raw'], default: 'image' },
  aspectRatio: { type: String, default: 'original' },
  fitMode: { type: String, enum: ['cover', 'contain'], default: 'cover' },
  width: { type: Number, default: null },
  height: { type: Number, default: null }
}, { _id: false });

const PostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', default: null },
  content: { type: String, trim: true, maxlength: 2000 },
  media: {
    type: [MediaSchema],
    default: []
  },
  mediaUrl: { type: String, default: null },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  commentsCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

PostSchema.virtual('likesCount').get(function () {
  return this.likes ? this.likes.length : 0;
});

PostSchema.set('toJSON', { virtuals: true });
PostSchema.set('toObject', { virtuals: true });

module.exports = mongoose.models.Post || mongoose.model('Post', PostSchema);
