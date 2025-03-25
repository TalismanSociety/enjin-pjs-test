import '@polkadot/api-augment/polkadot'

import { merkleizeMetadata } from '@polkadot-api/merkleize-metadata'
import { u8aToHex } from '@polkadot/util'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { Keyring } from '@polkadot/keyring'

const ENDPOINT = process.env.ENDPOINT
const MNEMONIC = process.env.MNEMONIC
if (typeof ENDPOINT !== 'string' || ENDPOINT.length === 0 || typeof MNEMONIC !== 'string' || MNEMONIC.length === 0) {
  console.error(`Usage: ENDPOINT="rpc url here" MNEMONIC="<mnemonic here>" bun dev`)
  process.exit(1)
}

console.log(`Connecting to ${ENDPOINT}`)
const api = new ApiPromise({
  provider: new WsProvider(ENDPOINT),
  throwOnConnect: true,
  noInitWarn: true,
})
await api.isReadyOrError

const keyring = new Keyring({ type: 'sr25519', ss58Format: api.registry.chainSS58 })
const keypair = keyring.addFromMnemonic(MNEMONIC)

const tokenDecimals = api.registry.chainDecimals?.[0] ?? 0

// if tokenDecimals is 0; 1 planck; otherwise 0.1 tokens
const transferAmount = tokenDecimals === 0 ? 1 : 0.1 * Math.pow(10, tokenDecimals)

const tx = api.tx.balances.transferKeepAlive(keypair.address, transferAmount)

console.log('Account address', keypair.address)
console.log('Transfer amount', transferAmount)

const tokenSymbol = api.registry.chainTokens[0]
const decimals = api.registry.chainDecimals[0]
const base58Prefix = api.registry.chainSS58 ?? 42
const specName = api.runtimeVersion.specName.toString()
const specVersion = api.runtimeVersion.specVersion.toNumber()

const metadataHash =
  api.runtimeMetadata.version >= 15 &&
  api.runtimeMetadata.asLatest.extrinsic.signedExtensions.some(
    (ext) => ext.identifier.toString() === 'CheckMetadataHash',
  )
    ? merkleizeMetadata(api.runtimeMetadata.toHex(), {
        tokenSymbol,
        decimals,
        base58Prefix,
        specName,
        specVersion,
      }).digest()
    : undefined

const metadataHashParams = metadataHash
  ? {
      metadataHash: u8aToHex(metadataHash),
      mode: 1,
    }
  : {}

console.log(
  '\ntokenSymbol',
  tokenSymbol,
  '\ndecimals',
  decimals,
  '\nbase58Prefix',
  base58Prefix,
  '\nspecName',
  specName,
  '\nspecVersion',
  specVersion,
  '\nmetadataHashParams',
  metadataHashParams,
  '\n',
)

try {
  console.log('Submitting tx', tx.toHuman())
  const result = await tx.signAndSend(keypair, {
    ...metadataHashParams,
    withSignedTransaction: true,
  })

  console.log(`Tx submitted: ${result.toHex()}`)
  process.exit(0)
} catch (cause) {
  console.error('Failed to submit tx:', cause)
  process.exit(1)
}
