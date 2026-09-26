const documentSchema = {
  transactionId: { type: String, default: '' },
  number: { type: String, default: '' },
  documentDate: { type: String, default: '' },
  templateId: { type: String, default: '' },
  id: { type: String, default: '' },
  type: {
    type: String,
    enum: ['contract', 'invoice', 'receipt', 'act', 'other'],
    default: 'other',
  },
  customTypeName: { type: String, default: '' },
  title: { type: String, default: '' },
  url: { type: String, default: '' },
  file: {
    type: {
      name: { type: String, default: '' },
      storageKey: { type: String, default: '' },
      url: { type: String, default: '' },
      path: { type: String, default: '' },
      size: { type: Number, default: null },
      contentType: { type: String, default: '' },
      checksum: { type: String, default: '' },
    },
    default: null,
  },
  createdAt: { type: Date, default: () => new Date() },
}

export default documentSchema
