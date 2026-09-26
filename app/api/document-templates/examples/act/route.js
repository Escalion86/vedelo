import { Document, Paragraph, Packer } from 'docx'
import { DEFAULT_ACT_TEMPLATE } from '@helpers/generateActTemplate'
import { DOCX_MIME } from '@server/documentGeneration'

export const GET = async () => {
  const content = await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: DEFAULT_ACT_TEMPLATE.split('\n').map(
            (text) => new Paragraph(text)
          ),
        },
      ],
    })
  )
  return new Response(content, {
    headers: {
      'Content-Type': DOCX_MIME,
      'Content-Disposition': 'attachment; filename="act-template.docx"',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
