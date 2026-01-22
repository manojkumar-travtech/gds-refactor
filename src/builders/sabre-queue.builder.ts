export class SabreQueueBuilder {
  buildQueuePlaceRequest(
    recordLocator: string,
    queueNumber: string,
    pcc: string,
  ) {
    return {
      OTA_QueuePlaceLLSRQ: {
        $: {
          Version: "1.0.0",
          xmlns: "http://webservices.sabre.com/sabreXML/2011/10",
        },
        QueueInfo: {
          QueueIdentifier: {
            $: {
              Number: queueNumber,
              PseudoCityCode: pcc,
            },
          },
        },
        RecordLocator: recordLocator,
      },
    };
  }
}
