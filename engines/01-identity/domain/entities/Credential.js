import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export class Credential {
  constructor({ identityId, passwordHash, createdAt = new Date().toISOString() }) {
    if (typeof identityId !== 'string' || identityId.trim() === '') {
      throw new Error('Credential requires an identityId.');
    }
    if (typeof passwordHash !== 'string' || passwordHash.trim() === '') {
      throw new Error('Credential requires protected password material.');
    }
    this.identityId = identityId;
    this.passwordHash = passwordHash;
    this.createdAt = createdAt;
    Object.freeze(this);
  }

  static async fromPassword(identityId, password, createdAt) {
    if (typeof password !== 'string' || password.length < 8) {
      throw new Error('Password must contain at least 8 characters.');
    }
    const salt = randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, KEY_LENGTH);
    return new Credential({
      identityId,
      passwordHash: `scrypt$${salt}$${Buffer.from(derivedKey).toString('hex')}`,
      createdAt
    });
  }

  async verify(password) {
    if (typeof password !== 'string') return false;
    const [algorithm, salt, storedKey] = this.passwordHash.split('$');
    if (algorithm !== 'scrypt' || !salt || !storedKey) return false;
    const derivedKey = await scrypt(password, salt, KEY_LENGTH);
    const storedBuffer = Buffer.from(storedKey, 'hex');
    const candidateBuffer = Buffer.from(derivedKey);
    return storedBuffer.length === candidateBuffer.length &&
      timingSafeEqual(storedBuffer, candidateBuffer);
  }
}
