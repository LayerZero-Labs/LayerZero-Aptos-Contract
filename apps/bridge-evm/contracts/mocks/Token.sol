// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
    uint8 DECIMALS;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) ERC20(_name, _symbol) {
        DECIMALS = _decimals;
        _mint(msg.sender, 10000 * 10**DECIMALS);
    }

    function mint(address _account, uint _amount) public {
        _mint(_account, _amount);
    }

    function decimals() public view override returns (uint8) {
        return DECIMALS;
    }
}
