export const colors = {
  background: '#0A0E12',
  surface: '#12181F',
  surfaceRaised: '#1A222B',
  accent: '#2DE1C2',
  accentDim: '#1A8577',
  textPrimary: '#F2F5F7',
  textSecondary: '#8A97A3',
  textOnAccent: '#04211C',
  spanishBubble: '#0F2A26',
  spanishBorder: '#1F5A50',
  englishBubble: '#161D25',
  danger: '#E15C5C',
  scoreGood: '#2DE1C2',
  scoreMid: '#E1B02D',
  scoreLow: '#E15C5C',
} as const;

export const fonts = {
  display: {fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5},
  title: {fontSize: 22, fontWeight: '600' as const},
  body: {fontSize: 17, fontWeight: '400' as const},
  caption: {fontSize: 13, fontWeight: '500' as const},
};
