// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function createAndInitializePoolIfNecessary(
        address token0, address token1, uint24 fee, uint160 sqrtPriceX96
    ) external payable returns (address pool);

    function mint(MintParams calldata params) external payable returns (
        uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1
    );

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function collect(CollectParams calldata params) external payable returns (
        uint256 amount0, uint256 amount1
    );
}

contract MemeToken {
    string public name;
    string public symbol;
    uint256 public totalSupply;
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _totalSupply) {
        name = _name;
        symbol = _symbol;
        totalSupply = _totalSupply;
        balanceOf[msg.sender] = _totalSupply;
        emit Transfer(address(0), msg.sender, _totalSupply);
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= amount, "ERC20: allowance");
            allowance[from][msg.sender] -= amount;
        }
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        require(balanceOf[from] >= amount, "ERC20: balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract MemeLaunchFactory {
    address public immutable nfpm;
    address public immutable wokb;
    uint24 public constant FEE = 10000; // 1%

    // LP NFT ownership: tokenId → creator (for fee collection only)
    mapping(uint256 => address) public lpCreator;
    // Token → creator
    mapping(address => address) public tokenCreator;

    event TokenLaunched(
        address indexed creator,
        address indexed token,
        address pool,
        uint256 tokenId
    );

    constructor(address _nfpm, address _wokb) {
        nfpm = _nfpm;
        wokb = _wokb;
    }

    function launch(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        int24 tickLower,
        int24 tickUpper,
        uint160 sqrtPriceX96
    ) external returns (address token, uint256 tokenId) {
        // 1. Deploy token — mints all supply to this factory
        MemeToken t = new MemeToken(name, symbol, totalSupply);
        token = address(t);

        // 2. Sort tokens for Uniswap
        (address token0, address token1) = token < wokb
            ? (token, wokb)
            : (wokb, token);

        // 3. Create and initialize pool
        address pool = INonfungiblePositionManager(nfpm).createAndInitializePoolIfNecessary(
            token0, token1, FEE, sqrtPriceX96
        );

        // 4. Approve NFPM to spend tokens
        MemeToken(token).approve(nfpm, totalSupply);

        // 5. Add single-sided liquidity — LP NFT stays in this contract (LOCKED)
        bool tokenIsToken0 = token < wokb;
        uint256 amount0 = tokenIsToken0 ? totalSupply : 0;
        uint256 amount1 = tokenIsToken0 ? 0 : totalSupply;

        (tokenId,,,) = INonfungiblePositionManager(nfpm).mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: FEE,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: amount0 * 95 / 100,
                amount1Min: amount1 * 95 / 100,
                recipient: address(this), // LP locked in factory forever
                deadline: block.timestamp + 3600
            })
        );

        // Record creator for fee collection
        lpCreator[tokenId] = msg.sender;
        tokenCreator[token] = msg.sender;

        emit TokenLaunched(msg.sender, token, pool, tokenId);
    }

    /**
     * Collect trading fees — only the original creator can call.
     * Fees are forwarded to the creator. LP stays locked.
     */
    function collectFees(uint256 tokenId) external {
        require(lpCreator[tokenId] == msg.sender, "Not creator");

        // Collect max fees
        INonfungiblePositionManager(nfpm).collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: msg.sender, // fees go to creator
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
    }

    // No decreaseLiquidity, no transfer — LP is permanently locked
}
