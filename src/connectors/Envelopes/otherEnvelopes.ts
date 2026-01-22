interface buildQueueCountRequestInterface {
  queueNumber: string | null | undefined;
  pcc: string;
}
export const buildQueueCountRequest = ({
  queueNumber = null,
  pcc,
}: buildQueueCountRequestInterface) => {
  const queueNumberAttr = queueNumber ? `Number="${queueNumber}"` : "";

  return `<QueueCountRQ Version="2.2.1" 
        xmlns="http://webservices.sabre.com/sabreXML/2011/10" 
        xmlns:xs="http://www.w3.org/2001/XMLSchema" 
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <QueueInfo>
            <QueueIdentifier PseudoCityCode="${pcc}" ${queueNumberAttr}/>
        </QueueInfo>
    </QueueCountRQ>`;
};

export const buildGetReservationRequest = (pnrNumber: string) => {
  return `<GetReservationRQ EchoToken="PNR-${Date.now()}" Version="1.19.0" 
            xmlns="http://webservices.sabre.com/pnrbuilder/v1_19">
            <Locator>${pnrNumber}</Locator>
            <RequestType>Stateful</RequestType>
            <ReturnOptions>
                <ViewName>FullWithOpenRes</ViewName>
                <ResponseFormat>STL</ResponseFormat>
            </ReturnOptions>
        </GetReservationRQ>`;
};

/**
 * Builds a navigation request
 * @param {string} action - Navigation action (I for next, QXI to end)
 * @returns {string} The XML request string
 */
export const buildNavigationRequest = (action: string): string => {
  return `<QueueAccessRQ Version="2.1.1" 
        xmlns="http://webservices.sabre.com/sabreXML/2011/10" 
        xmlns:xs="http://www.w3.org/2001/XMLSchema" 
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <Navigation Action="${action}"/>
    </QueueAccessRQ>`;
};

/**
 * Builds a queue access request with navigation
 * @param {string} pcc
 * @param {string|number} queueNumber - The queue number to access
 * @param {string|null} navigationAction - Navigation action (I for next, QXI to end)
 * @returns {string} The XML request string
 */
export const buildQueueAccessRequest = (
  pcc: string,
  queueNumber: string | number,
  navigationAction: string | null = null,
): string => {
  const navigationElement = navigationAction
    ? `<Navigation Action="${navigationAction}"/>`
    : "";

  return `<QueueAccessRQ Version="2.1.1" 
        xmlns="http://webservices.sabre.com/sabreXML/2011/10" 
        xmlns:xs="http://www.w3.org/2001/XMLSchema" 
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <QueueIdentifier Number="${queueNumber}" PseudoCityCode="${pcc}"/>
        ${navigationElement}
    </QueueAccessRQ>`;
};
