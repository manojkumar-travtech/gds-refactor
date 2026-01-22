import axios, { AxiosInstance } from "axios";
import { Parser } from "xml2js";

import {
  buildSoapEnvelope,
  BuildSoapEnvelopeInterface,
} from "../connectors/Envelopes/buildSoapEnvelope";
import { ConfigManager } from "../config/config.manager";

export interface SabreSoapError {
  Error?: {
    _: string;
    $?: {
      ShortText?: string;
    };
  };
  ErrorMessage?: {
    _: string;
  };
}

export interface SabreSoapResponseWrapper<T> {
  Envelope?: {
    Body?: T;
  };
  "soap-env:Envelope"?: {
    "soap-env:Body"?: T;
  };
}

type BuildSoapEnvelopeWithoutOrg = Omit<
  BuildSoapEnvelopeInterface,
  "organization"
>;

export class SabreSoapExecutor {
  private readonly httpClient: AxiosInstance;
  private readonly parser: Parser;
  protected readonly sabreConfig = ConfigManager.getInstance().sabre;

  constructor(endpoint: string) {
    this.httpClient = axios.create({
      baseURL: endpoint,
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
      },
      timeout: 30000,
    });

    this.parser = new Parser({
      explicitArray: false,
      ignoreAttrs: false,
    });
  }

  // Overload signatures
  async execute<TResponse>(
    request: BuildSoapEnvelopeWithoutOrg,
    responseKey: keyof TResponse,
  ): Promise<TResponse[keyof TResponse]>;

  async execute<TResponse>(
    request: BuildSoapEnvelopeWithoutOrg,
  ): Promise<TResponse>;

  // Implementation
  async execute<TResponse>(
    request: BuildSoapEnvelopeWithoutOrg,
    responseKey?: keyof TResponse,
  ): Promise<TResponse | TResponse[keyof TResponse]> {
    /** Build SOAP Envelope */
    const req = {
      ...request,
      organization: this.sabreConfig.organization,
    };
    const soapEnvelope = buildSoapEnvelope(req);

    /** Call Sabre */
    const response = await this.httpClient.post("", soapEnvelope);

    /** Parse XML */
    const parsed: SabreSoapResponseWrapper<TResponse> =
      await this.parser.parseStringPromise(response.data);

    /** Extract Body (supports both namespace styles) */
    const body =
      parsed?.["soap-env:Envelope"]?.["soap-env:Body"] ||
      parsed?.Envelope?.Body;

    if (!body) {
      throw new Error("Invalid SOAP response: Missing Body");
    }

    // If no responseKey provided, return the complete body
    if (!responseKey) {
      this.throwIfSabreError(body);
      return body;
    }

    const serviceResponse = body[responseKey];

    if (!serviceResponse) {
      throw new Error(`Invalid SOAP response: Missing ${String(responseKey)}`);
    }

    /** Sabre-standard error handling */
    this.throwIfSabreError(serviceResponse);

    return serviceResponse;
  }

  private throwIfSabreError(response: any): void {
    const errors: SabreSoapError | undefined =
      response?.Errors || response?.ResponseMessage?.Errors;

    if (!errors) return;

    const message =
      errors.Error?._ ||
      errors.Error?.$?.ShortText ||
      errors.ErrorMessage?._ ||
      "Unknown Sabre SOAP error";

    throw new Error(message);
  }
}
