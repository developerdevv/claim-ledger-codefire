import { Router } from 'express'
import multer from 'multer'
import { extractText, getDocumentProxy } from 'unpdf'

import { HttpError, asyncHandler } from '../middleware/errorHandler.js'
import { checkLimiter } from '../middleware/rateLimiter.js'
import { MAX_CHECK_TEXT } from './check.js'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_PAGES = 30

const upload = multer({
  storage: multer.memoryStorage(), // nothing is written to disk, nothing is kept
  limits: { fileSize: MAX_BYTES, files: 1 },
})

function receiveFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(413, 'That file is larger than 5 MB.'))
    }
    return next(new HttpError(400, 'Upload one PDF file in the "file" field.'))
  })
}

const router = Router()

// POST /api/documents/extract: multipart upload, field "file".
// Returns the text only. The caller then checks it through the normal check path.
// The file is treated as untrusted: size, type, page count and content are all limited.
router.post(
  '/extract',
  checkLimiter,
  receiveFile,
  asyncHandler(async (req, res) => {
    const file = req.file
    if (!file) throw new HttpError(400, 'Choose a PDF file to upload.')
    if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new HttpError(415, 'That file is not a PDF.')
    }

    let pdf
    try {
      pdf = await getDocumentProxy(new Uint8Array(file.buffer))
    } catch {
      throw new HttpError(422, 'That PDF could not be read. It may be damaged or password protected.')
    }

    try {
      if (pdf.numPages > MAX_PAGES) {
        throw new HttpError(413, `That PDF has ${pdf.numPages} pages. The limit is ${MAX_PAGES}.`)
      }
      const { totalPages, text } = await extractText(pdf, { mergePages: true })
      const clean = String(text)
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      if (clean.length < 20) {
        throw new HttpError(
          422,
          'No readable text was found. Scanned or image-only PDFs are not supported yet.',
        )
      }
      const truncated = clean.length > MAX_CHECK_TEXT
      res.json({
        filename: String(file.originalname ?? 'document.pdf').slice(0, 120),
        pages: totalPages,
        characters: clean.length,
        truncated,
        text: truncated ? clean.slice(0, MAX_CHECK_TEXT) : clean,
      })
    } finally {
      await pdf.destroy?.()
    }
  }),
)

export default router