/**
 * Engine 02: Observation Engine — Coordinates Value Object
 * Validates geographic latitude [-90, 90] and longitude [-180, 180].
 */

export class Coordinates {
  constructor({ latitude, longitude, altitude = null, accuracy = null } = {}) {
    const lat = Number(latitude);
    const lon = Number(longitude);

    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      throw new Error(`Invalid latitude: ${latitude}. Must be a number between -90 and 90.`);
    }
    if (Number.isNaN(lon) || lon < -180 || lon > 180) {
      throw new Error(`Invalid longitude: ${longitude}. Must be a number between -180 and 180.`);
    }

    this.latitude = lat;
    this.longitude = lon;
    this.altitude = altitude !== null && altitude !== undefined ? Number(altitude) : null;
    this.accuracy = accuracy !== null && accuracy !== undefined ? Number(accuracy) : null;
    Object.freeze(this);
  }

  toJSON() {
    return {
      latitude: this.latitude,
      longitude: this.longitude,
      altitude: this.altitude,
      accuracy: this.accuracy
    };
  }
}
