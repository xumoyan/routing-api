import { ChainId } from '@uniswap/sdk-core'
import * as cdk from 'aws-cdk-lib'
import { CfnOutput, Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib'
import * as chatbot from 'aws-cdk-lib/aws-chatbot'
import { BuildEnvironmentVariableType } from 'aws-cdk-lib/aws-codebuild'
import { PipelineNotificationEvents } from 'aws-cdk-lib/aws-codepipeline'
import { CodeBuildStep, CodePipeline, CodePipelineSource } from 'aws-cdk-lib/pipelines'
import { Construct } from 'constructs'
import dotenv from 'dotenv'
import 'source-map-support/register'
import { SUPPORTED_CHAINS } from '../lib/handlers/injector-sor'
import { STAGE } from '../lib/util/stage'
import { RoutingAPIStack } from './stacks/routing-api-stack'

dotenv.config()

export class RoutingAPIStage extends Stage {
  public readonly url: CfnOutput

  constructor(
    scope: Construct,
    id: string,
    props: StageProps & {
      jsonRpcProviders: { [chainName: string]: string }
      provisionedConcurrency: number
      ethGasStationInfoUrl: string
      chatbotSNSArn?: string
      stage: string
      internalApiKey?: string
      route53Arn?: string
      pinata_key?: string
      pinata_secret?: string
      hosted_zone?: string
      tenderlyUser: string
      tenderlyProject: string
      tenderlyAccessKey: string
      tenderlyNodeApiKey: string
      unicornSecret: string
      alchemyQueryKey?: string
      decentralizedNetworkApiKey?: string
    }
  ) {
    super(scope, id, props)
    const {
      jsonRpcProviders,
      provisionedConcurrency,
      ethGasStationInfoUrl,
      chatbotSNSArn,
      stage,
      internalApiKey,
      route53Arn,
      pinata_key,
      pinata_secret,
      hosted_zone,
      tenderlyUser,
      tenderlyProject,
      tenderlyAccessKey,
      tenderlyNodeApiKey,
      unicornSecret,
      alchemyQueryKey,
      decentralizedNetworkApiKey,
    } = props

    const { url } = new RoutingAPIStack(this, 'RoutingAPI', {
      jsonRpcProviders,
      provisionedConcurrency,
      ethGasStationInfoUrl,
      chatbotSNSArn,
      stage,
      internalApiKey,
      route53Arn,
      pinata_key,
      pinata_secret,
      hosted_zone,
      tenderlyUser,
      tenderlyProject,
      tenderlyAccessKey,
      tenderlyNodeApiKey,
      unicornSecret,
      alchemyQueryKey,
      decentralizedNetworkApiKey,
    })
    this.url = url
  }
}

export class RoutingAPIPipeline extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const code = CodePipelineSource.gitHub('xumoyan/routing-api', 'main')

    const synthStep = new CodeBuildStep('Synth', {
      input: code,
      commands: [
        'npm ci',
        'npm run build',
        'npx cdk synth',
      ],
    })

    const pipeline = new CodePipeline(this, 'RoutingAPIPipeline', {
      // The pipeline name
      pipelineName: 'RoutingAPI',
      crossAccountKeys: true,
      synth: synthStep,
    })

    // Load RPC provider URLs from AWS secret
    let jsonRpcProviders = {} as { [chainId: string]: string }
    SUPPORTED_CHAINS.forEach((chainId: ChainId) => {
      const key = `WEB3_RPC_${chainId}`
      jsonRpcProviders[key] = "https://morning-alien-card.quiknode.pro/54d7a389bc802b3e771e92a514d961ddcd9c349a"
      new CfnOutput(this, key, {
        value: jsonRpcProviders[key],
      })
    })

    // Load RPC provider URLs from AWS secret (for RPC Gateway)
    const RPC_GATEWAY_PROVIDERS = [
      // Optimism
      // 'INFURA_10',
      'QUICKNODE_10',
      'ALCHEMY_10',
      // Polygon
      'QUICKNODE_137',
      // 'INFURA_137',
      'ALCHEMY_137',
      // Celo
      'QUICKNODE_42220',
      // 'INFURA_42220',
      // Avalanche
      // 'INFURA_43114',
      'QUICKNODE_43114',
      'NIRVANA_43114',
      // BNB
      'QUICKNODE_56',
      // Base
      'QUICKNODE_8453',
      // 'INFURA_8453',
      'ALCHEMY_8453',
      'NIRVANA_8453',
      // Sepolia
      // 'INFURA_11155111',
      'ALCHEMY_11155111',
      // Arbitrum
      // 'INFURA_42161',
      'QUICKNODE_42161',
      'NIRVANA_42161',
      'ALCHEMY_42161',
      // Ethereum
      // 'INFURA_1',
      'QUICKNODE_1',
      'NIRVANA_1',
      'ALCHEMY_1',
      'QUICKNODERETH_1',
      // Blast
      'QUICKNODE_81457',
      // 'INFURA_81457',
      // ZORA
      'QUICKNODE_7777777',
      // ZkSync
      'QUICKNODE_324',
    ]
    for (const provider of RPC_GATEWAY_PROVIDERS) {
      jsonRpcProviders[provider] = "https://morning-alien-card.quiknode.pro/54d7a389bc802b3e771e92a514d961ddcd9c349a"
      new CfnOutput(this, provider, {
        value: jsonRpcProviders[provider],
      })
    }

    // Beta us-east-2
    const betaUsEast2Stage = new RoutingAPIStage(this, 'beta-us-east-2', {
      env: { account: '000000000000', region: 'us-east-2' },
      jsonRpcProviders: jsonRpcProviders,
      provisionedConcurrency: 10,
      ethGasStationInfoUrl: '',
      stage: STAGE.BETA,
      route53Arn: "",
      pinata_key: "",
      pinata_secret: "",
      hosted_zone: "",
      tenderlyUser: "",
      tenderlyProject: "",
      tenderlyAccessKey: "",
      unicornSecret: "",
      tenderlyNodeApiKey: "",
    })

    const betaUsEast2AppStage = pipeline.addStage(betaUsEast2Stage)

    this.addIntegTests(code, betaUsEast2Stage, betaUsEast2AppStage)

    // Prod us-east-2
    const prodUsEast2Stage = new RoutingAPIStage(this, 'prod-us-east-2', {
      env: { account: '000000000000', region: 'us-east-2' },
      jsonRpcProviders: jsonRpcProviders,
      internalApiKey: '',
      provisionedConcurrency: 70,
      ethGasStationInfoUrl: '',
      chatbotSNSArn: 'arn:aws:sns:us-east-2:644039819003:SlackChatbotTopic',
      stage: STAGE.PROD,
      route53Arn: '',
      pinata_key: '',
      pinata_secret: '',
      hosted_zone: '',
      tenderlyUser: '',
      tenderlyProject: '',
      tenderlyAccessKey: '',
      unicornSecret: '',
      tenderlyNodeApiKey: '',
    })

    const prodUsEast2AppStage = pipeline.addStage(prodUsEast2Stage)

    this.addIntegTests(code, prodUsEast2Stage, prodUsEast2AppStage)

    const slackChannel = chatbot.SlackChannelConfiguration.fromSlackChannelConfigurationArn(
      this,
      'SlackChannel',
      'arn:aws:chatbot::644039819003:chat-configuration/slack-channel/eng-ops-slack-chatbot'
    )

    pipeline.buildPipeline()
    pipeline.pipeline.notifyOn('NotifySlack', slackChannel, {
      events: [PipelineNotificationEvents.PIPELINE_EXECUTION_FAILED],
    })
  }

  private addIntegTests(
    sourceArtifact: cdk.pipelines.CodePipelineSource,
    routingAPIStage: RoutingAPIStage,
    applicationStage: cdk.pipelines.StageDeployment
  ) {
    const testAction = new CodeBuildStep(`IntegTests-${routingAPIStage.stageName}`, {
      projectName: `IntegTests-${routingAPIStage.stageName}`,
      input: sourceArtifact,
      envFromCfnOutputs: {
        UNISWAP_ROUTING_API: routingAPIStage.url,
      },
      buildEnvironment: {
        environmentVariables: {
          NPM_TOKEN: {
            value: 'npm-private-repo-access-token',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
          ARCHIVE_NODE_RPC: {
            value: 'archive-node-rpc-url-default-kms',
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          },
        },
      },
      commands: [
        'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc && npm ci',
        'echo "UNISWAP_ROUTING_API=${UNISWAP_ROUTING_API}" > .env',
        'echo "ARCHIVE_NODE_RPC=${ARCHIVE_NODE_RPC}" >> .env',
        'npm install',
        'npm run build',
        'npm run test:e2e',
      ],
    })

    applicationStage.addPost(testAction)
  }
}

const app = new cdk.App()

const jsonRpcProviders = {
  WEB3_RPC_1: process.env.WEB3_RPC_1!,
  WEB3_RPC_11155111: process.env.WEB3_RPC_11155111!,
  WEB3_RPC_44787: process.env.WEB3_RPC_44787!,
  WEB3_RPC_80001: process.env.WEB3_RPC_80001!,
  WEB3_RPC_81457: process.env.WEB3_RPC_81457!,
  WEB3_RPC_42161: process.env.WEB3_RPC_42161!,
  WEB3_RPC_421613: process.env.WEB3_RPC_421613!,
  WEB3_RPC_10: process.env.WEB3_RPC_10!,
  WEB3_RPC_137: process.env.WEB3_RPC_137!,
  WEB3_RPC_42220: process.env.WEB3_RPC_42220!,
  WEB3_RPC_43114: process.env.WEB3_RPC_43114!,
  WEB3_RPC_56: process.env.WEB3_RPC_56!,
  WEB3_RPC_8453: process.env.WEB3_RPC_8453!,
  WEB3_RPC_324: process.env.WEB3_RPC_324!,
  // The followings are for RPC Gateway
  // Optimism
  // INFURA_10: process.env.INFURA_10!,
  QUICKNODE_10: process.env.QUICKNODE_10!,
  ALCHEMY_10: process.env.ALCHEMY_10!,
  // Polygon
  QUICKNODE_137: process.env.QUICKNODE_137!,
  // INFURA_137: process.env.INFURA_137!,
  ALCHEMY_137: process.env.ALCHEMY_137!,
  // Celo
  QUICKNODE_42220: process.env.QUICKNODE_42220!,
  // INFURA_42220: process.env.INFURA_42220!,
  // Avalanche
  // INFURA_43114: process.env.INFURA_43114!,
  QUICKNODE_43114: process.env.QUICKNODE_43114!,
  NIRVANA_43114: process.env.NIRVANA_43114!,
  // BNB
  QUICKNODE_56: process.env.QUICKNODE_56!,
  // Base
  QUICKNODE_8453: process.env.QUICKNODE_8453!,
  // INFURA_8453: process.env.INFURA_8453!,
  ALCHEMY_8453: process.env.ALCHEMY_8453!,
  NIRVANA_8453: process.env.NIRVANA_8453!,
  // Sepolia
  // INFURA_11155111: process.env.INFURA_11155111!,
  ALCHEMY_11155111: process.env.ALCHEMY_11155111!,
  // Arbitrum
  // INFURA_42161: process.env.INFURA_42161!,
  QUICKNODE_42161: process.env.QUICKNODE_42161!,
  NIRVANA_42161: process.env.NIRVANA_42161!,
  ALCHEMY_42161: process.env.ALCHEMY_42161!,
  // Ethereum
  // INFURA_1: process.env.INFURA_1!,
  QUICKNODE_1: process.env.QUICKNODE_1!,
  NIRVANA_1: process.env.NIRVANA_1!,
  ALCHEMY_1: process.env.ALCHEMY_1!,
  // Blast
  QUICKNODE_81457: process.env.QUICKNODE_81457!,
  // INFURA_81457: process.env.INFURA_81457!,
  // Zora
  QUICKNODE_7777777: process.env.QUICKNODE_7777777!,
  // ZkSync
  QUICKNODE_324: process.env.QUICKNODE_324!,
  ALCHEMY_324: process.env.ALCHEMY_324!,
}

// Local dev stack
new RoutingAPIStack(app, 'RoutingAPIStack', {
  jsonRpcProviders: jsonRpcProviders,
  provisionedConcurrency: process.env.PROVISION_CONCURRENCY ? parseInt(process.env.PROVISION_CONCURRENCY) : 0,
  throttlingOverride: process.env.THROTTLE_PER_FIVE_MINS,
  ethGasStationInfoUrl: process.env.ETH_GAS_STATION_INFO_URL!,
  chatbotSNSArn: process.env.CHATBOT_SNS_ARN,
  stage: STAGE.LOCAL,
  internalApiKey: 'test-api-key',
  route53Arn: process.env.ROLE_ARN,
  pinata_key: process.env.PINATA_API_KEY!,
  pinata_secret: process.env.PINATA_API_SECRET!,
  hosted_zone: process.env.HOSTED_ZONE!,
  tenderlyUser: process.env.TENDERLY_USER!,
  tenderlyProject: process.env.TENDERLY_PROJECT!,
  tenderlyAccessKey: process.env.TENDERLY_ACCESS_KEY!,
  tenderlyNodeApiKey: process.env.TENDERLY_NODE_API_KEY!,
  unicornSecret: process.env.UNICORN_SECRET!,
})

new RoutingAPIPipeline(app, 'RoutingAPIPipelineStack', {
  env: { account: '000000000000', region: 'us-east-2' },
})
