import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import ts from 'typescript'

// Fingerprints of the pre-S implementation, taken before editing these screens.
// TypeScript printing ignores formatting and preserves expressions/payloads/order.
const baseline = {
  "app/(auth)/login.tsx": {
    "variables": {
      "credentialsSchema": "f956a63056696bffa77070f66e812ba60004cf16b67c7b1400d922eac0add7d1",
      "redirectUri": "569ea5fd9908d9417a19e85d35a517825250e82a1b69886440da177675abf30b",
      "changeMode": "8bae00077943b1ec3400e5fc547bef7f94fa48d863bad02525ff204362a599be",
      "finish": "eaeaeb49f74f4d80f3cf36cd4b3b383d8ad98923ad11ffc7914dd29ba7d052aa",
      "submitCredentials": "d8363b7f6f58b952dffd1768c03c64d9306a30f146275f542231a5b5c7a7e849",
      "startVk": "7f3407e9f6678bf7eb9a22bded3b8b26d006f9b63752728acbcb9b05a9fdf59e",
      "checkCall": "fead5e1ec84cdb4d2f36ed1d2dcc317d9a1d314e3f4522d9126fe24365209196",
      "sendSms": "cc9f5dbd6422e6d9eba5c045e423f900337506572dbe7f6317c55e47cb3def31",
      "checkSms": "e63a184b851832a70ae87e8a80f7343e0d1f8e1f55353040558a2efa2ed36b8f"
    },
    "effects": [
      "ca3367e85cb2a6abf19ab018c4c8055ec24c45dc7691e6432a42bc862b8b9e24",
      "df9ccfa1053040a5962923b1f16bf242350780b5e9a45cedce97703873895c22"
    ]
  },
  "app/onboarding/index.tsx": {
    "variables": {
      "timeZones": "7c3da0d0266ae926afe9612f51dfdb5708f2588e4cd2da7cfca95bf50a576507",
      "next": "01983d410787288afd52c04df8c089d9f82c4686f4b6d4b7ccb4eed62590c3c6",
      "finish": "17bd376ba58014e90b04c9ab6b2e4c9692c7414b0ec5defd2f799be4c237eb8a"
    },
    "effects": [
      "e6301a8c647eeab3746fd57a9dc50f7933141a111f7d824b7ce11fe0816ee239"
    ]
  },
  "app/sync/index.tsx": {
    "variables": {
      "load": "a2c9cb3f16ff1f4cf0deabd065ae35f92c00f51989eb45a938ae26aa2b397763",
      "sync": "a94c4c532b5d31bc41ccd09ce40d696cf264bd6884554182d6de41b5d9335687",
      "retryOperation": "bff7b3aaeca7447259f2faec95877014932000ad9f1ed39a4f7dee4e0a367c4d",
      "retryFile": "8990d96e39dbc835c36da879990847c8ac772ac5da11679ab8afecceab4f87ea",
      "decide": "5d0c67cf50901c34f7b7e6e965d9a271057558db9df521d6264679daaeaafe06"
    },
    "effects": [
      "8e35dda525ed5c647f52a29ed1006495cb461062c6f99d56f03559238c1d5011"
    ]
  },
  "app/_layout.tsx": {
    "variables": {},
    "effects": [
      "49316e2e322c66c0c4934a21820f282604dafafc39bed4d7442ab538ccdfed8e",
      "bea043bc7ab8373495a8da0d9b66f5dc73093c88b408f3ecf0a95e1b5caf0801",
      "244e268d3ab91c7a336c5806fca30fc4b22ad60843d27b57f62ef3842c0cf7ff"
    ]
  }
} as const

const printer = ts.createPrinter({ removeComments: true })
it.each(Object.entries(baseline))('%s: lifecycle and operation bodies match pre-S', (file, expected) => {
  const source = ts.createSourceFile(file, fs.readFileSync(path.resolve(__dirname, '../../../', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const variables: Record<string, string> = {}
  const effects: string[] = []
  const hash = (node: ts.Node) => crypto.createHash('sha256').update(printer.printNode(ts.EmitHint.Unspecified, node, source)).digest('hex')
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)) {
      const name = node.name.getText(source)
      const baselineName = file === 'app/sync/index.tsx' && name === 'readLocalState' ? 'load' : name
      if (baselineName in expected.variables && !(file === 'app/sync/index.tsx' && name === 'load')) {
        variables[baselineName] = hash(node.initializer!)
      }
    }
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect') effects.push(hash(node))
    ts.forEachChild(node, visit)
  }
  visit(source)
  expect(variables).toEqual(expected.variables)
  expect(effects).toEqual(expected.effects)
})
