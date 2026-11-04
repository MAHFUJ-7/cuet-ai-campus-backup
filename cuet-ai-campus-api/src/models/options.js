export const baseOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret) => {
      if (ret._id) ret.id = String(ret._id);
      return ret;
    },
  },
  toObject: { virtuals: true },
};
