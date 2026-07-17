import React from 'react';

type BrandAssetProps = {
  className?: string;
};

type MarkProps = {
  prefix: string;
  boxed?: boolean;
};

const GradientDefs: React.FC<{ prefix: string }> = ({ prefix }) => (
  <defs>
    <linearGradient id={`${prefix}-gold`} x1="10" y1="84" x2="68" y2="8" gradientUnits="userSpaceOnUse">
      <stop stopColor="#9A5F00" />
      <stop offset="0.48" stopColor="#E4B04B" />
      <stop offset="1" stopColor="#FFF0BD" />
    </linearGradient>
    <linearGradient id={`${prefix}-silver`} x1="45" y1="8" x2="84" y2="88" gradientUnits="userSpaceOnUse">
      <stop stopColor="#FFFFFF" />
      <stop offset="0.48" stopColor="#DCE3EA" />
      <stop offset="1" stopColor="#7D8FA3" />
    </linearGradient>
  </defs>
);

const BrandMark: React.FC<MarkProps> = ({ prefix, boxed = false }) => (
  <>
    {boxed && (
      <>
        <rect x="0" y="0" width="96" height="96" rx="25" fill="#001B30" />
        <rect x="2" y="2" width="92" height="92" rx="23" fill="none" stroke="#164F73" strokeWidth="2" />
      </>
    )}
    <g transform={boxed ? 'translate(15 12)' : 'translate(2 0)'}>
      <path d="M0 72L34 0H48L15 72H0Z" fill={`url(#${prefix}-gold)`} />
      <path d="M44 0L78 72H62L36 16L44 0Z" fill={`url(#${prefix}-silver)`} />
      <path d="M36 43C37.4 49 41.5 53.1 47.5 54.5C41.5 55.9 37.4 60 36 66C34.6 60 30.5 55.9 24.5 54.5C30.5 53.1 34.6 49 36 43Z" fill="#E4B04B" />
    </g>
  </>
);

const Wordmark: React.FC<{ dark?: boolean }> = ({ dark = false }) => (
  <>
    <text
      x="138"
      y="74"
      fill={dark ? '#F7F9FC' : 'var(--kp-logo-word, #002C4B)'}
      fontFamily="Outfit, 'Avenir Next', Inter, sans-serif"
      fontSize="48"
      fontWeight="600"
      letterSpacing="7"
    >
      AVALA
    </text>
    <text
      x="350"
      y="74"
      fill={dark ? '#E9B95D' : 'var(--kp-logo-accent, #9A6500)'}
      fontFamily="Outfit, 'Avenir Next', Inter, sans-serif"
      fontSize="48"
      fontWeight="600"
      letterSpacing="7"
    >
      OS
    </text>
  </>
);

export const AvalaPrimaryLogo: React.FC<BrandAssetProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 540 104" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Avala OS">
    <GradientDefs prefix="avala-primary" />
    <g transform="translate(8 16) scale(0.94)">
      <BrandMark prefix="avala-primary" />
    </g>
    <path d="M112 15V89" stroke="var(--kp-logo-divider, #CBD5E1)" strokeWidth="1.5" />
    <Wordmark />
  </svg>
);

export const AvalaAppIcon: React.FC<BrandAssetProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Avala OS app icon">
    <GradientDefs prefix="avala-icon" />
    <BrandMark prefix="avala-icon" boxed />
  </svg>
);

export const AvalaHeroLogo: React.FC<BrandAssetProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 640 148" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Avala OS — Assess, Validate, Align, Launch, Audit">
    <GradientDefs prefix="avala-hero" />
    <g transform="translate(10 19)">
      <BrandMark prefix="avala-hero" />
    </g>
    <path d="M113 19V99" stroke="#456078" strokeWidth="1.5" />
    <Wordmark dark />
    <text x="138" y="121" fill="#C6D1DC" fontFamily="Outfit, 'Avenir Next', Inter, sans-serif" fontSize="16" fontWeight="600" letterSpacing="1.6">
      ASSESS  •  VALIDATE  •  ALIGN  •  LAUNCH  •  AUDIT
    </text>
  </svg>
);

export const AvalaEnterpriseLockup: React.FC<BrandAssetProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 690 148" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Avala OS — Governed AI and Automation Delivery OS">
    <GradientDefs prefix="avala-enterprise" />
    <g transform="translate(10 19)">
      <BrandMark prefix="avala-enterprise" />
    </g>
    <path d="M113 19V99" stroke="#456078" strokeWidth="1.5" />
    <Wordmark dark />
    <text x="138" y="121" fill="#C6D1DC" fontFamily="Outfit, 'Avenir Next', Inter, sans-serif" fontSize="16" fontWeight="600" letterSpacing="1.6">
      GOVERNED AI &amp; AUTOMATION DELIVERY OS
    </text>
  </svg>
);

export const AvalaWordmark = AvalaPrimaryLogo;
export const AvalaLogo = AvalaAppIcon;
