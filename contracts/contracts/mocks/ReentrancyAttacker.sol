// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IPixelPass {
    function buyTicket(uint256 concertId, uint8 tier) external payable returns (uint256);
    function listForResale(uint256 tokenId, uint256 price) external;
    function withdraw() external;
}

/// @notice TEST ONLY. A malicious seller that tries to re-enter withdraw()
///         while it is receiving ETH, hoping to be paid twice.
contract ReentrancyAttacker {
    IPixelPass public immutable target;
    uint256 public reentryAttempts;
    bool public reentrySucceeded;
    bool public reentryBlocked;

    constructor(address pixelPass) {
        target = IPixelPass(pixelPass);
    }

    function buy(uint256 concertId, uint8 tier) external payable returns (uint256) {
        return target.buyTicket{value: msg.value}(concertId, tier);
    }

    function list(uint256 tokenId, uint256 price) external {
        target.listForResale(tokenId, price);
    }

    function attack() external {
        target.withdraw();
    }

    receive() external payable {
        if (reentryAttempts == 0) {
            reentryAttempts++;
            try target.withdraw() {
                reentrySucceeded = true;
            } catch {
                reentryBlocked = true;
            }
        }
    }
}
