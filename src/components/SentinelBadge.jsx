import PropTypes from 'prop-types';
import SentinelShield from './SentinelShield';

const SentinelBadge = ({ compact = false }) => {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <SentinelShield size="sm" />
        Sentinel Verified
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
      <SentinelShield size="sm" />
      Sentinel Verified
    </span>
  );
};

SentinelBadge.propTypes = {
  compact: PropTypes.bool
};

export default SentinelBadge;
