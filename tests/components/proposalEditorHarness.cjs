const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

async function fingerprint(inputs) {
  const digest = crypto.createHash('sha256')
  const files = await Promise.all(inputs.map(file => fs.readFile(file)))
  inputs.forEach((file, index) => digest.update(file).update(files[index]))
  return digest.digest('hex')
}

async function buildFixture(artifactDir) {
    const esbuild = require(process.env.ESBUILD_MODULE)
    const bundle = await esbuild.build({
      entryPoints: ['tests/components/proposalEditor.fixture.jsx'],
      bundle: true,
      write: false,
      metafile: true,
      outdir: path.join(artifactDir, 'bundle'),
      platform: 'browser',
      jsx: 'automatic',
      loader: { '.js': 'jsx' },
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
      plugins: [
        {
          name: 'boundaries',
          setup(build) {
            const mocks = {
              '@state/atoms':
                'export {default as modalsFuncAtom} from "./state/atoms/modalsFuncAtom";',
              'next/navigation': 'export const useRouter=()=>({refresh(){}})',
              '@helpers/useSnackbar':
                'const s={success(){},error(){},warning(){},info(){}}; export default ()=>s;',
              '@helpers/cloudinary':
                'export const sendImage=async()=>null; export async function sendFile(file){return {url:"https://cloud.escalion.ru/uploads/test/"+file.name}}',
            }
            build.onResolve(
              {
                filter:
                  /^(@state\/atoms$|next\/navigation$|@helpers\/useSnackbar$|@helpers\/cloudinary$)/,
              },
              (args) => ({ path: args.path, namespace: 'mock' })
            )
            build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
              contents: mocks[args.path],
              resolveDir: process.cwd(),
              loader: 'jsx',
            }))
            build.onResolve(
              { filter: /^@(state|layouts|components|helpers)\// },
              (args) => ({
                path: path.resolve(
                  args.path.slice(1) + (path.extname(args.path) ? '' : '.js')
                ),
              })
            )
          },
        },
      ],
    })
    const js = bundle.outputFiles.find((file) => file.path.endsWith('.js')).text
    const moduleCss =
      bundle.outputFiles.find((file) => file.path.endsWith('.css'))?.text || ''
    const css =
      (
        await require('postcss')([require('@tailwindcss/postcss')()]).process(
          await fs.readFile('app/globals.css', 'utf8'),
          { from: path.resolve('app/globals.css') }
        )
      ).css + moduleCss

  const inputs = [...Object.keys(bundle.metafile.inputs).filter(file => !file.startsWith('node_modules/') && !file.startsWith('mock:') && !/^<.*>$/.test(file)), 'app/globals.css', 'tailwind.config.js'].sort()
  return { js, css, inputs, fingerprint: await fingerprint(inputs) }
}

exports.buildFixture = buildFixture
exports.fingerprint = fingerprint
if (require.main === module) {
  const artifactDir = process.env.QA_ARTIFACT_DIR
  if (!artifactDir) throw Error('QA_ARTIFACT_DIR обязателен')
  buildFixture(artifactDir).then(value => fs.writeFile(path.join(artifactDir, 'browser-fixture.json'), JSON.stringify(value))).catch(error => { console.error(error); process.exitCode = 1 })
}
