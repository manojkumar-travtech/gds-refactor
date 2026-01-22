export const LogoutEnvelope = (sabrePcc: string) => {
  return `<SessionCloseRQ xmlns="http://webservices.sabre.com" Version="2.0.0">
        <POS>
          <Source PseudoCityCode="${sabrePcc}" />
        </POS>
      </SessionCloseRQ>
    `;
};
