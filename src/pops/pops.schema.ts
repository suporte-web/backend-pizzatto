import mongoose from 'mongoose';

export const PopSchema = new mongoose.Schema(
  {
    filename: String,
    originalName: String,
    mimetype: String,
    size: String,
    filePath: String,
    folder: String,
  },
  { timestamps: true },
);
