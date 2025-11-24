import { Document } from 'mongoose';

export interface Pop extends Document {
  filename: string;
  originalName: string;
  mimetype: string;
  size: string;
  filePath: string;
  folder: string;
  createdAt: Date;
  updatedAt: Date;
}
