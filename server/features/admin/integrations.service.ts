import { db } from "../../db";
import { systemIntegrations } from "@shared/schema";
import { eq } from "drizzle-orm";
import Mailgun from "mailgun.js";
import FormData from "form-data";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import twilio from "twilio";
import Stripe from "stripe";

export type ServiceName = "mailgun" | "cloudflare_r2" | "twilio" | "stripe";

export interface MailgunConfig {
  apiKey: string;
  domain: string;
  fromEmail: string;
  region: "us" | "eu";
}

export interface CloudflareR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

export interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  mode: "test" | "live";
}

export async function getIntegration(service: ServiceName) {
  const [row] = await db
    .select()
    .from(systemIntegrations)
    .where(eq(systemIntegrations.service, service))
    .limit(1);
  return row || null;
}

export async function getAllIntegrations() {
  const rows = await db.select().from(systemIntegrations);
  const result: Record<string, any> = {};

  for (const row of rows) {
    result[row.service] = {
      id: row.id,
      service: row.service,
      enabled: row.enabled,
      config: maskSecrets(row.service as ServiceName, row.config as Record<string, string>),
      lastTestedAt: row.lastTestedAt,
      lastTestResult: row.lastTestResult,
      updatedAt: row.updatedAt,
    };
  }

  return result;
}

function maskSecrets(service: ServiceName, config: Record<string, string>): Record<string, string> {
  const masked = { ...config };
  const secretFields: Record<ServiceName, string[]> = {
    mailgun: ["apiKey"],
    cloudflare_r2: ["accessKeyId", "secretAccessKey"],
    twilio: ["authToken"],
    stripe: ["secretKey", "webhookSecret"],
  };

  for (const field of secretFields[service] || []) {
    if (masked[field]) {
      const val = masked[field];
      masked[field] = val.length > 8 ? val.slice(0, 4) + "****" + val.slice(-4) : "****";
    }
  }

  return masked;
}

export async function saveIntegration(service: ServiceName, config: Record<string, any>, enabled: boolean) {
  const existing = await getIntegration(service);

  if (existing) {
    const existingConfig = existing.config as Record<string, string>;
    const mergedConfig = { ...config };
    const secretFields: Record<ServiceName, string[]> = {
      mailgun: ["apiKey"],
      cloudflare_r2: ["accessKeyId", "secretAccessKey"],
      twilio: ["authToken"],
      stripe: ["secretKey", "webhookSecret"],
    };

    for (const field of secretFields[service] || []) {
      if (mergedConfig[field] && mergedConfig[field].includes("****")) {
        mergedConfig[field] = existingConfig[field];
      }
    }

    const [updated] = await db
      .update(systemIntegrations)
      .set({
        config: mergedConfig,
        enabled,
        updatedAt: new Date(),
      })
      .where(eq(systemIntegrations.id, existing.id))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(systemIntegrations)
      .values({
        service,
        config,
        enabled,
      })
      .returning();
    return created;
  }
}

export async function testIntegration(service: ServiceName): Promise<{ success: boolean; message: string }> {
  const integration = await getIntegration(service);
  if (!integration) {
    return { success: false, message: "Integration not configured" };
  }

  const config = integration.config as Record<string, string>;
  let result: { success: boolean; message: string };

  try {
    switch (service) {
      case "mailgun":
        result = await testMailgun(config as unknown as MailgunConfig);
        break;
      case "cloudflare_r2":
        result = await testCloudflareR2(config as unknown as CloudflareR2Config);
        break;
      case "twilio":
        result = await testTwilio(config as unknown as TwilioConfig);
        break;
      case "stripe":
        result = await testStripe(config as unknown as StripeConfig);
        break;
      default:
        result = { success: false, message: "Unknown service" };
    }
  } catch (err: any) {
    result = { success: false, message: err.message || "Test failed" };
  }

  await db
    .update(systemIntegrations)
    .set({
      lastTestedAt: new Date(),
      lastTestResult: result.success ? "pass" : `fail: ${result.message}`,
      updatedAt: new Date(),
    })
    .where(eq(systemIntegrations.id, integration.id));

  return result;
}

async function testMailgun(config: MailgunConfig): Promise<{ success: boolean; message: string }> {
  if (!config.apiKey || !config.domain) {
    return { success: false, message: "API Key and Domain are required" };
  }

  const mailgun = new Mailgun(FormData);
  const mg = mailgun.client({
    username: "api",
    key: config.apiKey,
    url: config.region === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net",
  });

  const domainInfo = await mg.domains.get(config.domain);
  return {
    success: true,
    message: `Connected to domain: ${domainInfo.name} (state: ${domainInfo.state})`,
  };
}

async function testCloudflareR2(config: CloudflareR2Config): Promise<{ success: boolean; message: string }> {
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    return { success: false, message: "Account ID, Access Key ID, and Secret Access Key are required" };
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const result = await s3.send(new ListBucketsCommand({}));
  const bucketNames = (result.Buckets || []).map(b => b.Name);
  const bucketExists = config.bucketName ? bucketNames.includes(config.bucketName) : true;

  return {
    success: true,
    message: `Connected. ${result.Buckets?.length || 0} bucket(s) found.${config.bucketName ? (bucketExists ? ` Bucket "${config.bucketName}" exists.` : ` Warning: Bucket "${config.bucketName}" not found.`) : ""}`,
  };
}

async function testTwilio(config: TwilioConfig): Promise<{ success: boolean; message: string }> {
  if (!config.accountSid || !config.authToken) {
    return { success: false, message: "Account SID and Auth Token are required" };
  }

  const client = twilio(config.accountSid, config.authToken);
  const account = await client.api.accounts(config.accountSid).fetch();

  return {
    success: true,
    message: `Connected to account: ${account.friendlyName} (status: ${account.status})`,
  };
}

export function getMailgunClient(config: MailgunConfig) {
  const mailgun = new Mailgun(FormData);
  return mailgun.client({
    username: "api",
    key: config.apiKey,
    url: config.region === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net",
  });
}

export function getR2Client(config: CloudflareR2Config) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function getTwilioClient(config: TwilioConfig) {
  return twilio(config.accountSid, config.authToken);
}

async function testStripe(config: StripeConfig): Promise<{ success: boolean; message: string }> {
  if (!config.secretKey) {
    return { success: false, message: "Secret Key is required" };
  }

  const stripe = new Stripe(config.secretKey);
  const account = await stripe.accounts.retrieve();

  const mode = config.secretKey.startsWith("sk_test_") ? "Test" : "Live";
  return {
    success: true,
    message: `Connected to ${account.business_profile?.name || account.id} (${mode} mode)`,
  };
}

export function getStripeClient(config: StripeConfig) {
  return new Stripe(config.secretKey);
}
