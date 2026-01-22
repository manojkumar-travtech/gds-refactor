import { v4 as uuidv4 } from "uuid";

export interface loginEnevelopeType {
  username: string;
  organization: string;
  password: string;
  clientId: string;
  clientSecret: string;
  pcc: string;
  domain: string;
}
export const loginEnevelope = ({
  username,
  clientId,
  clientSecret,
  organization,
  password,
  pcc,
  domain,
}: loginEnevelopeType): string => {
  const timestamp = new Date().toISOString();
  const messageId = uuidv4();

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:eb="http://www.ebxml.org/namespaces/messageHeader" xmlns:wsse="http://schemas.xmlsoap.org/ws/2002/12/secext">
    <soap-env:Header>
        <eb:MessageHeader soap-env:mustUnderstand="1" eb:version="2.0.0">
            <eb:From><eb:PartyId>${username}</eb:PartyId></eb:From>
            <eb:To><eb:PartyId>999999</eb:PartyId></eb:To>
            <eb:CPAId>${organization}</eb:CPAId>
            <eb:ConversationId>ProfileSync-${messageId}</eb:ConversationId>
            <eb:Service>SessionCreateRQ</eb:Service>
            <eb:Action>SessionCreateRQ</eb:Action>
            <eb:MessageData>
                <eb:MessageId>${messageId}</eb:MessageId>
                <eb:Timestamp>${timestamp}</eb:Timestamp>
            </eb:MessageData>
        </eb:MessageHeader>
        <wsse:Security xmlns:wsse="http://schemas.xmlsoap.org/ws/2002/12/secext" xmlns:wsu="http://schemas.xmlsoap.org/ws/2002/12/utility">
            <wsse:UsernameToken>
                <wsse:Username>${username}</wsse:Username>
                <wsse:Password>${password}</wsse:Password>
                <Organization>${organization}</Organization>
                <Domain>${domain}</Domain>${
                  clientId
                    ? `
                <ClientId>${clientId}</ClientId>`
                    : ""
                }${
                  clientSecret
                    ? `
                <ClientSecret>${clientSecret}</ClientSecret>`
                    : ""
                }
            </wsse:UsernameToken>
        </wsse:Security>
    </soap-env:Header>
    <soap-env:Body>
        <sws:SessionCreateRQ xmlns:sws="http://webservices.sabre.com" Version="2.0.0">
            <POS>
                <Source PseudoCityCode="${pcc}"/>
            </POS>
        </sws:SessionCreateRQ>
    </soap-env:Body>
</soap-env:Envelope>`;
  return soapEnvelope;
};
