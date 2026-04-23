import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
class MerchantLedger extends Model {
  /**
   * PES Logic: calculateSettlementWindow
   * Determines liquidity speed based on Sentinel Reliability.
   */
  static calculateSettlementWindow(score, tier) {
    // Global rule: 24h for top-tier nodes, 48h for standard.
    if (score > 80 || tier === 'Gold') {
      return 24; 
    }
    return 48;
  }
}

MerchantLedger.init({
  merchant_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  reliability_score: {
    type: DataTypes.INTEGER,
    defaultValue: 0 // Starting point for all Sentinels
  },
  verification_pass: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  voucher_25_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  location_point: {
    type: DataTypes.GEOMETRY('POINT', 4326), // PostGIS SRID 4326
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'MerchantLedger',
  hooks: {
    beforeSave: (ledger) => {
      // PES Milestone Unlock: 25% Trust Threshold
      if (ledger.reliability_score >= 25) {
        ledger.verification_pass = true;
        ledger.voucher_25_enabled = true;
        
        // TODO: Trigger email/dashboard notification hooks here
        // Example: NotificationService.send(ledger.merchant_id, 'VERIFICATION_SUCCESS');
      }
    }
  }
});

// Placeholder for Amazon Managed Blockchain integration for immutability
// @see https://aws.amazon.com/managed-blockchain/

export default MerchantLedger;