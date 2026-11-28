export default function Icon({ icon: SvgIcon, size = 18, className = "", ...props }) {
  return (
    <SvgIcon
      size={size}
      strokeWidth={1.8}
      className={className}
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}
