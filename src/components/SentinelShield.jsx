import PropTypes from 'prop-types';

const SentinelShield = ({ size = 'md', className = '' }) => {
  const sizes = { sm: 20, md: 30, lg: 40 };
  const sizeNum = sizes[size] || sizes.md;

  return (
    <svg
      viewBox="0 0 100 120"
      width={sizeNum}
      height={sizeNum * 1.2}
      className={`inline-block align-middle ${className}`}
      style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))' }}
    >
      <defs>
        <linearGradient id="shieldGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#BF953F" />
          <stop offset="25%" stopColor="#FCF6BA" />
          <stop offset="50%" stopColor="#B38728" />
          <stop offset="75%" stopColor="#FBF5B7" />
          <stop offset="100%" stopColor="#AA771C" />
        </linearGradient>
        <linearGradient id="spearGold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8A6E2F" />
          <stop offset="100%" stopColor="#5D4B1F" />
        </linearGradient>
      </defs>
      <g stroke="url(#spearGold)" strokeWidth="2.5" strokeLinecap="round">
        <line x1="20" y1="20" x2="80" y2="100" />
        <line x1="80" y1="20" x2="20" y2="100" />
        <path d="M15,10 L25,22 L10,22 Z" fill="url(#shieldGold)" />
        <path d="M85,10 L75,22 L90,22 Z" fill="url(#shieldGold)" />
      </g>
      <path
        d="M50,5 C30,20 12,55 12,85 C12,105 30,118 50,115 C70,118 88,105 88,85 C88,55 70,20 50,5 Z"
        fill="url(#shieldGold)"
        stroke="#755B19"
        strokeWidth="1.5"
      />
      <g fill="none" stroke="#755B19" strokeWidth="1" opacity="0.6">
        <line x1="50" y1="15" x2="50" y2="105" strokeWidth="2" />
        <path d="M35,40 Q50,45 65,40" />
        <path d="M32,60 Q50,65 68,60" />
        <path d="M35,80 Q50,85 65,80" />
      </g>
      <path d="M50,8 C35,22 18,55 18,85" fill="none" stroke="white" strokeWidth="1" opacity="0.3" />
    </svg>
  );
};

SentinelShield.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  className: PropTypes.string,
};

export default SentinelShield;