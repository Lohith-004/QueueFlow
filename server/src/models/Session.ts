import mongoose, { Schema, type Document, type Model, Types } from 'mongoose';

export interface ISession extends Document {
  userId: Types.ObjectId;
  isValid: boolean;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const sessionSchema = new Schema<ISession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    isValid: {
      type: Boolean,
      default: true,
      required: true,
    },
    userAgent: {
      type: String,
      trim: true,
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
    },
  },
  {
    timestamps: true,
  }
);

// TTL Index: MongoDB automatically purges expired sessions once expiresAt timestamp is reached
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound Index: Provides low-latency lookups for authGuard (validating active session by ID)
sessionSchema.index({ _id: 1, isValid: 1 });

export const Session: Model<ISession> =
  mongoose.models.Session || mongoose.model<ISession>('Session', sessionSchema);
