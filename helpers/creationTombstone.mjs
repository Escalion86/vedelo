// Idempotent resources retain only their reservation after deletion. This keeps
// a delayed insert/retry from recreating a deleted record on standalone MongoDB.
export const installCreationTombstoneFilter = (schema) => {
  schema.pre(['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'updateOne', 'updateMany', 'countDocuments', 'distinct'], function () {
    if (this.options.includeCreationTombstones) {
      delete this.options.includeCreationTombstones
      return
    }
    this.where({ creationDeletedAt: { $exists: false } })
  })
  schema.pre('save', function () {
    if (!this.isNew) this.$where = { ...this.$where, creationDeletedAt: { $exists: false } }
  })
}
