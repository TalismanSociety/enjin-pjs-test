import '@polkadot/api-augment/polkadot'

import { merkleizeMetadata } from '@polkadot-api/merkleize-metadata'
import { u8aToHex } from '@polkadot/util'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { Keyring } from '@polkadot/keyring'

const ENDPOINT = 'wss://rpc.relay.blockchain.enjin.io'
const MNEMONIC = process.env.MNEMONIC
if (typeof MNEMONIC !== 'string' || MNEMONIC.length === 0) {
  console.error(`Usage: MNEMONIC="<mnemonic here>" bun dev`)
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

const tx = api.tx.balances.transferKeepAlive(
  keypair.address,
  // 0.1 ENJ
  '100000000000000000',
)

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
)

try {
  console.log('Submitting tx')
  const result = await tx.signAndSend(keypair, {
    ...metadataHashParams,
    withSignedTransaction: true,
  })

  console.log(`Tx submitted: https://enjin.subscan.io/extrinsic/${result.toHex()}`)
  process.exit(0)
} catch (cause) {
  console.error('Failed to submit tx:', cause)
  process.exit(1)
}
