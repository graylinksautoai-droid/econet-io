import { randomUUID } from 'crypto';

export class Role {
  constructor({ roleId = `rol_${randomUUID().replace(/-/g, '')}`, name, permissions = [] }) {
    if (typeof roleId !== 'string' || roleId.trim() === '') {
      throw new Error('Role requires a roleId.');
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Role requires a name.');
    }
    if (!Array.isArray(permissions) || permissions.some(permission => typeof permission !== 'string' || permission.trim() === '')) {
      throw new Error('Role permissions must be an array of non-empty strings.');
    }
    this.roleId = roleId;
    this.name = name.trim();
    this.permissions = Object.freeze([...new Set(permissions)]);
    Object.freeze(this);
  }

  grant(permission) {
    if (typeof permission !== 'string' || permission.trim() === '') {
      throw new Error('Permission must be a non-empty string.');
    }
    return new Role({ ...this.toJSON(), permissions: [...this.permissions, permission.trim()] });
  }

  revoke(permission) {
    return new Role({ ...this.toJSON(), permissions: this.permissions.filter(item => item !== permission) });
  }

  toJSON() {
    return { roleId: this.roleId, name: this.name, permissions: [...this.permissions] };
  }
}
