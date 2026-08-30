export default function SnapMark({ size = 24, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <rect x="21" y="3" width="6" height="15" rx="3" fill="#2E6BF0" transform="rotate(45 24 24)" />
      <rect x="21" y="3" width="6" height="15" rx="3" fill="#F2B21B" transform="rotate(135 24 24)" />
      <rect x="21" y="3" width="6" height="15" rx="3" fill="#3BA55D" transform="rotate(225 24 24)" />
      <rect x="21" y="3" width="6" height="15" rx="3" fill="#E5443C" transform="rotate(315 24 24)" />
    </svg>
  );
}
