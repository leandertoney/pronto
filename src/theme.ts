/**
 * Guatapé palette: the painted zócalo houses near Medellín — vivid coral,
 * sunshine yellow, and turquoise trim on warm whitewashed walls.
 * Fun and colorful, but tasteful: a warm cream canvas with a few
 * saturated accents doing the talking.
 */
export const colors = {
  background: '#FFF7EC',
  surface: '#FFFFFF',
  surfaceRaised: '#F9E9D2',
  accent: '#F25C3A', // zócalo coral — CTA + mic
  turquoise: '#12A5A0',
  sunshine: '#FFB627',
  textPrimary: '#33241C',
  textSecondary: '#8A6F5C',
  textOnAccent: '#FFFFFF',
  spanishBubble: '#E0F5F2',
  spanishBorder: '#12A5A0',
  spanishText: '#0B7C77',
  englishBubble: '#FFF2D1',
  danger: '#D93A2B',
  scoreGood: '#2BA84A',
  scoreMid: '#F5A623',
  scoreLow: '#D93A2B',
} as const;

export const fonts = {
  display: {fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5},
  title: {fontSize: 22, fontWeight: '600' as const},
  body: {fontSize: 17, fontWeight: '400' as const},
  caption: {fontSize: 13, fontWeight: '500' as const},
};
