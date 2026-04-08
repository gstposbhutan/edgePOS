/**
 * NEXUS BHUTAN - UI Package
 *
 * This package provides the Royal Bhutan design system with custom
 * Shadcn components featuring the official NEXUS BHUTAN aesthetic.
 *
 * @package @nexus-bhutan/ui
 */

// Export design tokens
export const designTokens = {
  colors: {
    obsidian: '#0F172A',
    gold: '#D4AF37',
    emerald: '#10B981',
    tibetan: '#EF4444',
  },
  fonts: {
    primary: 'Noto Sans',
    display: 'Noto Serif',
  },
  effects: {
    glassmorphism: 'backdrop-blur-xl bg-slate-900/40',
  },
};

// CSS utility functions for Royal Bhutan theme
export const getGlassmorphismStyle = (opacity: number = 0.4) => ({
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  backgroundColor: `rgba(15, 23, 42, ${opacity})`,
});

export const getGoldPulseAnimation = () => ({
  animation: 'pulse-gold 2s infinite',
});

export const getSuccessFlashAnimation = () => ({
  animation: 'success-flash 0.5s ease-out',
});

export const getErrorShakeAnimation = () => ({
  animation: 'error-shake 0.5s ease-out',
});

// Component-specific utility functions
export const getBoundingBoxStyle = (isRecognized: boolean = false) => ({
  borderColor: isRecognized ? designTokens.colors.emerald : designTokens.colors.gold,
  animation: isRecognized ? 'success-flash 0.5s ease-out' : 'pulse-gold 2s infinite',
});

export const getCameraOverlayStyle = () => ({
  position: 'relative' as const,
  overflow: 'hidden' as const,
});
