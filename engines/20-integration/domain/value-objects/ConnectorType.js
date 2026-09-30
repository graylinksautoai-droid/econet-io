/**
 * Engine 20: Integration Engine — ConnectorType Value Object
 *
 * CANONICAL BASIS: The canonical registry description for Engine 20 names three
 * responsibilities: "External connector management, 3rd-party satellite/weather
 * API adaptors, and protocol gateways." The six types below map directly to
 * these three concerns:
 *
 *   satellite/weather API adaptors → SATELLITE_API, WEATHER_API
 *   external connector management  → SENSOR_GATEWAY, INSTITUTIONAL_API,
 *                                     WEBHOOK_ENDPOINT
 *   protocol gateways              → PROTOCOL_GATEWAY
 *
 * No additional types are invented. If new connector types are required they
 * must be added via an approved canonical specification change.
 */

export const ConnectorType = Object.freeze({
  /** 3rd-party satellite data API (e.g. remote sensing imagery, orbital data) */
  SATELLITE_API: 'SATELLITE_API',
  /** 3rd-party weather/atmospheric data API */
  WEATHER_API: 'WEATHER_API',
  /** IoT/environmental sensor gateway */
  SENSOR_GATEWAY: 'SENSOR_GATEWAY',
  /** Institutional or government API (research, authority, regulatory) */
  INSTITUTIONAL_API: 'INSTITUTIONAL_API',
  /** Inbound webhook endpoint (external system pushes events to EcoNet) */
  WEBHOOK_ENDPOINT: 'WEBHOOK_ENDPOINT',
  /** Protocol translation gateway (MQTT, CoAP, FTP, SFTP, etc.) */
  PROTOCOL_GATEWAY: 'PROTOCOL_GATEWAY'
});

export function isValidConnectorType(type) {
  return Object.values(ConnectorType).includes(type);
}

export function normalizeConnectorType(type) {
  const normalized = String(type ?? '').trim().toUpperCase();
  if (!isValidConnectorType(normalized)) {
    throw new Error(
      `Invalid connector type: "${type}". Supported types: ${Object.values(ConnectorType).join(', ')}.`
    );
  }
  return normalized;
}
