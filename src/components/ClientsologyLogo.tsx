import React from 'react';

interface ClientsologyLogoProps {
  theme?: 'light' | 'dark';
  className?: string;
}

export const ClientsologyLogo: React.FC<ClientsologyLogoProps> = ({
  theme = 'dark',
  className = 'h-8 w-auto',
}) => {
  const isDark = theme === 'dark';

  // Design-system adapted palette matching Obsidian (#111214), Electric Lime (#D9F154), Lavender (#C8B6FF)
  const ink = isDark ? '#F4F5F7' : '#111214';
  const lime = isDark ? '#D9F154' : '#89B000';
  const limeBright = isDark ? '#D9F154' : '#A8CF1B';
  const lavender = isDark ? '#C8B6FF' : '#7C5CFF';
  const nodeRingFill = isDark ? '#111214' : '#FFFFFF';

  const spokeAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const cx = 188;
  const cy = 34.5;

  return (
    <svg
      viewBox="0 0 326 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Clientsology"
    >
      {/* C */}
      <path
        d="M 35.2 19.3 A 17.5 17.5 0 1 0 35.2 42.7 L 29.8 37.8 A 10.2 10.2 0 1 1 29.8 24.2 Z"
        fill={ink}
      />

      {/* l */}
      <rect x="42.5" y="12" width="7.2" height="35.5" rx="0.8" fill={ink} />

      {/* i (stem + Lime geometric dot) */}
      <rect x="55" y="21.8" width="7.2" height="25.7" rx="0.8" fill={ink} />
      <circle cx="58.6" cy="14.2" r="4.3" fill={limeBright} />

      {/* e (with signature overlapping diagonal bar) */}
      <path
        d="M 93.3 32.2 A 13.5 13.5 0 1 0 90.6 42.8 L 85.4 38.75 A 6.9 6.9 0 1 1 86.8 33.3 Z"
        fill={ink}
      />
      {/* Diagonal crossbar on 'e' matching reference */}
      <rect
        x="68.5"
        y="33.5"
        width="25.8"
        height="5.2"
        rx="1"
        transform="rotate(-21 81.4 36.1)"
        fill={lime}
        fillOpacity={0.92}
      />
      <rect
        x="81.2"
        y="33.5"
        width="13.1"
        height="5.2"
        rx="1"
        transform="rotate(-21 81.4 36.1)"
        fill={lavender}
        fillOpacity={0.65}
      />

      {/* n */}
      <path
        d="M 99.5 47.5 V 21.8 H 106.5 V 25.2 A 10.6 10.6 0 0 1 124.5 32.6 V 47.5 H 117.3 V 33.4 A 5.4 5.4 0 0 0 106.7 33.4 V 47.5 Z"
        fill={ink}
      />

      {/* t (with overlapping dual-tone crossbar) */}
      <path
        d="M 132.5 14.5 H 139.6 V 40.2 C 139.6 42.3 141.0 43.2 143.3 43.0 L 145.6 42.7 L 146.2 47.6 C 144.2 48.1 141.6 48.2 139.6 48.0 C 134.8 47.5 132.5 44.5 132.5 39.8 Z"
        fill={ink}
      />
      <rect x="132.5" y="21.8" width="7.1" height="5.2" fill={lavender} fillOpacity={0.92} />
      <rect x="139.6" y="21.8" width="6.2" height="5.2" rx="0.6" fill={limeBright} fillOpacity={0.95} />

      {/* s */}
      <path
        d="M 164.6 27.6 C 162.8 26.2 160.6 25.5 158.6 25.5 C 156.7 25.5 155.5 26.3 155.5 27.6 C 155.5 29.0 157.2 29.7 160.2 30.6 C 164.8 32.0 167.8 34.1 167.8 38.8 C 167.8 44.4 163.2 48.0 156.9 48.0 C 153.2 48.0 149.8 46.8 147.6 44.9 L 150.7 40.3 C 152.6 41.9 154.8 42.7 157.0 42.7 C 159.2 42.7 160.6 41.8 160.6 40.2 C 160.6 38.7 159.2 37.9 155.9 36.9 C 151.4 35.6 148.6 33.4 148.6 28.7 C 148.6 23.5 153.0 20.6 158.6 20.6 C 161.9 20.6 165.0 21.6 167.3 23.4 Z"
        fill={ink}
      />

      {/* [o] Connected Radial Network Node Ring + Ascending 3-Bar Chart Emblem */}
      <g>
        {spokeAngles.map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x1 = cx + Math.cos(rad) * 8.4;
          const y1 = cy + Math.sin(rad) * 8.4;
          const x2 = cx + Math.cos(rad) * 13.4;
          const y2 = cy + Math.sin(rad) * 13.4;
          const nx = cx + Math.cos(rad) * 15.2;
          const ny = cy + Math.sin(rad) * 15.2;
          const isAccentNode = deg % 90 === 45;
          return (
            <g key={deg}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isAccentNode ? lavender : lime}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle
                cx={nx}
                cy={ny}
                r="2.0"
                fill={nodeRingFill}
                stroke={isAccentNode ? lavender : lime}
                strokeWidth="1.45"
              />
            </g>
          );
        })}

        {/* Central Circle Ring */}
        <circle cx={cx} cy={cy} r="8.4" fill={nodeRingFill} stroke={ink} strokeWidth="1.8" />

        {/* 3 Ascending Analytics Bars inside the circle */}
        <rect x={cx - 4.4} y={cy + 0.6} width="2.2" height="4.0" rx="0.5" fill={lavender} />
        <rect x={cx - 1.1} y={cy - 1.6} width="2.2" height="6.2" rx="0.5" fill={ink} />
        <rect x={cx + 2.2} y={cy - 4.0} width="2.2" height="8.6" rx="0.5" fill={lime} />
      </g>

      {/* l */}
      <rect x="209.5" y="12" width="7.2" height="35.5" rx="0.8" fill={ink} />

      {/* o */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M 234 21.0 A 13.5 13.5 0 1 0 234 48.0 A 13.5 13.5 0 1 0 234 21.0 Z M 234 27.6 A 6.9 6.9 0 1 1 234 41.4 A 6.9 6.9 0 1 1 234 27.6 Z"
        fill={ink}
      />

      {/* g (with upper-right overlapping accent bar & bottom curved bowl) */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M 263.5 21.0 A 13.0 13.0 0 1 0 263.5 47.0 A 13.0 13.0 0 1 0 263.5 21.0 Z M 263.5 27.4 A 6.6 6.6 0 1 1 263.5 40.6 A 6.6 6.6 0 1 1 263.5 27.4 Z"
        fill={ink}
      />
      <rect x="270.4" y="21.8" width="7.1" height="24.2" rx="0.8" fill={ink} />
      {/* Bottom curved tail of 'g' */}
      <path
        d="M 253.8 52.8 A 14.5 14.5 0 0 0 274.2 52.6 L 269.7 48.4 A 8.8 8.8 0 0 1 257.8 48.6 Z"
        fill={ink}
      />
      {/* Overlapping accent bar at upper-right of 'g' */}
      <rect x="263.5" y="21.4" width="14.2" height="5.4" rx="0.7" fill={lavender} fillOpacity={0.85} />
      <rect x="270.4" y="21.4" width="7.3" height="5.4" rx="0.7" fill={limeBright} fillOpacity={0.9} />

      {/* y (left stem + overlapping lime right arm) */}
      <polygon points="282.5,21.8 289.8,21.8 297.2,40.8 293.0,47.5 290.8,47.5" fill={ink} />
      <polygon
        points="303.6,21.8 311.0,21.8 296.4,56.8 289.0,56.8"
        fill={limeBright}
        fillOpacity={0.92}
      />
    </svg>
  );
};
