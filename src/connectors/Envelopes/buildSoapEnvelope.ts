import axios from "axios";
import { parseStringPromise } from "xml2js";
import { v4 as uuidv4 } from "uuid";

export interface BuildSoapEnvelopeInterface {
  service: string;
  action: string;
  organization: string;
  sessionToken: string;
  body: string;
}

export const buildSoapEnvelope = ({
  action,
  organization,
  service,
  sessionToken,
  body,
}: BuildSoapEnvelopeInterface): string => {
  const timestamp = new Date().toISOString();
  const messageId = uuidv4();

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:eb="http://www.ebxml.org/namespaces/messageHeader" xmlns:wsse="http://schemas.xmlsoap.org/ws/2002/12/secext" xmlns="http://www.sabre.com/eps/schemas">
    <soap-env:Header>
        <eb:MessageHeader soap-env:mustUnderstand="1">
            <eb:From>
                <eb:PartyId>${organization}</eb:PartyId>
            </eb:From>
            <eb:To>
                <eb:PartyId>123123</eb:PartyId>
            </eb:To>
            <eb:CPAId>${organization}</eb:CPAId>
            <eb:ConversationId>QueueSync-${messageId}</eb:ConversationId>
            <eb:Service>${service}</eb:Service>
            <eb:Action>${action}</eb:Action>
            <eb:MessageData>
                <eb:MessageId>${messageId}</eb:MessageId>
                <eb:Timestamp>${timestamp}</eb:Timestamp>
            </eb:MessageData>
        </eb:MessageHeader>
        <wsse:Security>
            <wsse:BinarySecurityToken valueType="String" EncodingType="wsse:Base64Binary">${sessionToken}</wsse:BinarySecurityToken>
        </wsse:Security>
    </soap-env:Header>
    <soap-env:Body>
        ${body}
    </soap-env:Body>
</soap-env:Envelope>`;
};

export interface SendQueueRequestOptions extends BuildSoapEnvelopeInterface {
  endpoint: string;
  timeout?: number;
}

export const sendQueueRequest = async ({
  service,
  action,
  organization,
  sessionToken,
  body,
  endpoint,
  timeout = 30000,
}: SendQueueRequestOptions) => {
  const soapEnvelope = buildSoapEnvelope({
    service,
    action,
    organization,
    sessionToken,
    body,
  });

  try {
    const response = await axios.post(endpoint, soapEnvelope, {
      headers: {
        "Content-Type": "text/xml",
        SOAPAction: action,
      },
      timeout,
      timeoutErrorMessage: `Sabre API request timed out after ${timeout}ms (${service}/${action})`,
    });

    return await parseStringPromise(response.data);
  } catch (error: any) {
    if (error.code === "ECONNABORTED") {
      throw new Error(
        `Sabre API request timed out while calling ${service}/${action}: ${error.message}`,
      );
    }
    throw new Error(
      `Sabre API request failed (${service}/${action}): ${error.message}`,
    );
  }
};
