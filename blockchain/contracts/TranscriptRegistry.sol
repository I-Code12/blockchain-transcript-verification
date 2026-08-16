// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TranscriptRegistry {
    address public immutable registrar;
    struct Credential { bytes32 documentHash; uint64 issuedAt; bool revoked; }
    mapping(bytes32 => Credential) private credentials;
    event TranscriptIssued(bytes32 indexed credentialId, bytes32 indexed documentHash, uint64 issuedAt);
    event TranscriptRevoked(bytes32 indexed credentialId, uint64 revokedAt);
    error RegistrarOnly(); error AlreadyIssued(); error UnknownCredential();

    constructor() { registrar = msg.sender; }
    modifier onlyRegistrar() { if (msg.sender != registrar) revert RegistrarOnly(); _; }

    function issue(bytes32 credentialId, bytes32 documentHash) external onlyRegistrar {
        if (credentials[credentialId].issuedAt != 0) revert AlreadyIssued();
        uint64 timestamp = uint64(block.timestamp);
        credentials[credentialId] = Credential(documentHash, timestamp, false);
        emit TranscriptIssued(credentialId, documentHash, timestamp);
    }

    function revoke(bytes32 credentialId) external onlyRegistrar {
        Credential storage item = credentials[credentialId];
        if (item.issuedAt == 0) revert UnknownCredential();
        item.revoked = true; emit TranscriptRevoked(credentialId, uint64(block.timestamp));
    }

    function verify(bytes32 credentialId, bytes32 suppliedHash) external view returns (bool authentic, bool revoked, uint64 issuedAt) {
        Credential memory item = credentials[credentialId];
        return (item.issuedAt != 0 && item.documentHash == suppliedHash && !item.revoked, item.revoked, item.issuedAt);
    }
}
