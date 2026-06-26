// Минимальные типы для npm-пакета `qrcode`.
// Пакет не поставляется со встроенными .d.ts, а отдельный @types/qrcode
// ставить не обязательно — этого файла достаточно для используемых нами функций.
declare module 'qrcode' {
  export interface QRCodeToDataURLOptions {
    width?: number
    margin?: number
    scale?: number
    errorCorrectionLevel?: 'low' | 'medium' | 'quartile' | 'high' | 'L' | 'M' | 'Q' | 'H'
    color?: {
      dark?: string
      light?: string
    }
  }

  export function toDataURL(
    text: string,
    options?: QRCodeToDataURLOptions
  ): Promise<string>

  const QRCode: {
    toDataURL: typeof toDataURL
  }

  export default QRCode
}