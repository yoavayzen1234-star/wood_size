declare module 'bidi-js' {
  type ParagraphDirection = 'ltr' | 'rtl' | 'auto'

  export type EmbeddingLevels = {
    levels: Uint8Array
    paragraphs: Array<{ start: number; end: number; level: number }>
  }

  export type Bidi = {
    getEmbeddingLevels: (text: string, direction?: ParagraphDirection) => EmbeddingLevels
    getReorderSegments: (
      text: string,
      embeddingLevels: EmbeddingLevels,
      lineStart?: number,
      lineEndInclusive?: number,
    ) => Array<[number, number]>
    mirrorString: (text: string, embeddingLevels: EmbeddingLevels) => string
  }

  const bidiFactory: () => Bidi
  export default bidiFactory
}

