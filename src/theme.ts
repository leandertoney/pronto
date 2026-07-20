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

/**
 * Bricolage Grotesque for display/title/button (personality, the Spanish
 * phrase face), Instrument Sans for body/caption (readable, quiet). Loaded
 * via @expo-google-fonts in app/_layout.tsx; PostScript names below must
 * match the font family names those packages register.
 */
export const fonts = {
  display: {
    fontFamily: 'BricolageGrotesque_800ExtraBold',
    fontSize: 36,
    letterSpacing: -0.8,
  },
  title: {
    fontFamily: 'BricolageGrotesque_700Bold',
    fontSize: 20,
  },
  body: {
    fontFamily: 'InstrumentSans_400Regular',
    fontSize: 16,
  },
  caption: {
    fontFamily: 'InstrumentSans_500Medium',
    fontSize: 13,
  },
  button: {
    fontFamily: 'BricolageGrotesque_700Bold',
    fontSize: 16,
  },
  // Custom fonts don't reliably synthesize italics from fontStyle on native,
  // so the italic bilingual-subtitle style (used throughout) gets its own
  // real italic font family instead of `caption` + fontStyle: 'italic'.
  captionItalic: {
    fontFamily: 'InstrumentSans_500Medium_Italic',
    fontSize: 13,
  },
  // Not in the original 5-variant spec; added for the one bolded body
  // phrase in the Home tagline ("Spanish for right now.") since fontWeight
  // has no effect on a custom fontFamily and there's no other bold body use.
  bodyBold: {
    fontFamily: 'InstrumentSans_700Bold',
    fontSize: 16,
  },
};
