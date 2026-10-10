import mongoose, { Schema, type Document, type Model } from 'mongoose';
import { UserRole, type IUserSummary } from '@queueflow/shared';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  toUserSummary(): IUserSummary;
}

export const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Never returned by default in queries to prevent credential leakage
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: Object.values(UserRole),
        message: 'Invalid user role: {VALUE}',
      },
      default: UserRole.CUSTOMER,
      required: [true, 'Role is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as Record<string, unknown>).passwordHash;
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        delete (ret as Record<string, unknown>).passwordHash;
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
  }
);

// Method to format a sanitized, public IUserSummary DTO
userSchema.methods.toUserSummary = function (): IUserSummary {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    isActive: this.isActive,
    createdAt: this.createdAt ? this.createdAt.toISOString() : new Date().toISOString(),
  };
};

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', userSchema);
