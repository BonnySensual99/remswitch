class OperationGate {
    constructor() {
        this.activeRequestId = null;
    }

    begin(requestId) {
        if (this.activeRequestId) {
            return { accepted: false, requestId: this.activeRequestId, errorCode: 'SWITCH_BUSY' };
        }
        this.activeRequestId = requestId;
        return { accepted: true, requestId };
    }

    end(requestId) {
        if (this.activeRequestId === requestId) this.activeRequestId = null;
    }
}

module.exports = { OperationGate };
