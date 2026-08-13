import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "replace-this-secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: object) {
  return jwt.sign(payload as string | object | Buffer, JWT_SECRET as jwt.Secret, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET);
}
