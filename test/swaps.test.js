// import { defaultAbiCoder } from "@ethersproject/abi";

const Token = artifacts.require("Token");
const Weth = artifacts.require("WrappedEther");

const Router = artifacts.require("SwapsRouter");
const Factory = artifacts.require("SwapsFactory");
const SwapsPair = artifacts.require("SwapsPair")

const ethUtil = require('ethereumjs-util');
const { defaultAbiCoder } = require('@ethersproject/abi');
const { solidityPack } = require('@ethersproject/solidity');
// const catchRevert = require("./exceptionsHelpers.js").catchRevert;
const { expectRevert } = require('@openzeppelin/test-helpers');

// const defaultAbiCoder = require("ethers/lib/utils").defaultAbiCoder;
// const solidityPack = require("ethers/utils").solidityPack;

// console.log(ethUtil, 'ethUtil');
// console.log(ethUtil.zeroAddress, 'ethUtil');
// console.log(ethUtil.isZeroAddress, 'ethUtil');
// console.log(ethUtil.generateAddress, 'ethUtil');

require("./utils");

const MINIMUM_LIQUIDITY = 10 ** 3;

const BN = web3.utils.BN;
const APPROVE_VALUE = web3.utils.toWei("1000000");
const APPROVE_VALUE_MAX = web3.utils.toBN(2).pow(web3.utils.toBN(256)).sub(web3.utils.toBN(1));

const ONE_ETH = web3.utils.toWei("1");
const ONE_TOKEN = web3.utils.toWei("1");

const FOUR_TOKENS = web3.utils.toWei("4");
const FIVE_TOKENS = web3.utils.toWei("5");
const NINE_TOKENS = web3.utils.toWei("5");

const FOUR_ETH = web3.utils.toWei("4");
const FIVE_ETH = web3.utils.toWei("5");
const NINE_ETH = web3.utils.toWei("9");

const STATIC_SUPPLY = web3.utils.toWei("500");
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const getPermitDigest = async (
    token,
    approve,
    nonce,
    deadline,
) => {

    const DOMAIN_SEPARATOR = await token.DOMAIN_SEPARATOR();
    const PERMIT_TYPEHASH = await token.PERMIT_TYPEHASH();

    return web3.utils.keccak256(
        solidityPack(
            [
                "bytes1",
                "bytes1",
                "bytes32",
                "bytes32"
            ],
            [
                "0x19",
                "0x01",
                DOMAIN_SEPARATOR,
                web3.utils.keccak256(
                    defaultAbiCoder.encode(
                        [
                            "bytes32",
                            "address",
                            "address",
                            "uint256",
                            "uint256",
                            "uint256"
                        ],
                        [
                            PERMIT_TYPEHASH,
                            approve.owner,
                            approve.spender,
                            approve.value,
                            nonce,
                            deadline
                        ],
                    ),
                ),
            ],
        ),
    );
}

const getLastEvent = async (eventName, instance) => {
    const events = await instance.getPastEvents(eventName, {
        fromBlock: 0,
        toBlock: "latest",
    });
    return events.pop().returnValues;
};

const sign = (digest, privateKey) => {
    return ethUtil.ecsign(Buffer.from(digest.slice(2), 'hex'), privateKey);
}

const toHex = (str) => {

    var hex = ''
    for (var i = 0; i < str.length; i++) {
        hex += '' + str.charCodeAt(i).toString(16)
    }
    return hex;
}


contract("Swaps", ([owner, alice, bob, random]) => {

    // let firstAccount = accounts[0];
    // console.log(firstAccount, 'firstAccount');
    // console.log(firstAccount.secretKey, 'firstAccount.secretKey');
    // console.log(owner.secretKey, 'owner');

    let weth;
    let token;
    let token2;
    let token3;
    let factory;
    let router;
    let erc20;
    // let launchTime;

    // beforeEach(async () => {
    before(async () => {
        weth = await Weth.new();
        token = await Token.new();
        token2 = await Token.new();
        token3 = await Token.new();
        factory = await Factory.new(owner);
        router = await Router.new(
            factory.address,
            weth.address
        );
    });

    describe("Factory Initial Values and Functions", () => {

        it("should have correct feeToSetter address", async () => {
            const feeToSetterAddress = await factory.feeToSetter();
            assert.equal(
                feeToSetterAddress,
                owner
            );
        });

        it("should have correct feeTo value", async () => {

            const feeToValue = await factory.feeTo();
            const expectedValue = owner;

            assert.equal(
                feeToValue,
                expectedValue
            );
        });

        it("should have correct feeToSetter value", async () => {
            const feeToSetterValue = await factory.feeToSetter();
            const expectedValue = owner;

            assert.equal(
                feeToSetterValue,
                expectedValue
            );
        });

        it("should allow to change feeTo value", async () => {

            const newFeeToAddress = bob;

            await factory.setFeeTo(
                newFeeToAddress
            );

            const expectedValue = await factory.feeTo();

            assert.equal(
                newFeeToAddress,
                expectedValue
            );
        });

        it("should allow to change feeToSetter value", async () => {

            const newFeeToSetterAddress = alice;

            await factory.setFeeToSetter(
                newFeeToSetterAddress,
            );

            const expectedValue = await factory.feeToSetter();

            assert.equal(
                newFeeToSetterAddress,
                expectedValue
            );
        });
    });

    describe("Factory Pairs", () => {

        it("should correctly generate pair address", async () => {

            await factory.createPair(
                token.address,
                weth.address
            );

            const { token0, token1, pair } = await getLastEvent(
                "PairCreated",
                factory
            );

            const lookupAddress = await router.pairFor(
                factory.address,
                token.address,
                weth.address
            );

            assert.equal(
                pair,
                lookupAddress
            );
        });

        it("should have correct MINIMUM_LIQUIDITY value", async () => {

            const { token0, token1, pair } = await getLastEvent(
                "PairCreated",
                factory
            );

            const pairconract = await SwapsPair.at(pair);
            const minValue = await pairconract.MINIMUM_LIQUIDITY();

            assert.equal(
                MINIMUM_LIQUIDITY.toString(),
                minValue.toString()
            );
        });

        it("should have correct token0 and token1 values in event", async () => {

            // pair already generated in previous test

            /* await factory.createPair(
                token.address,
                weth.address
            );*/

            const { token0, token1, pair } = await getLastEvent(
                "PairCreated",
                factory
            );

            const expectedToken0 = token.address > weth.address
                ? weth.address
                : token.address

            const expectedToken1 = token.address > weth.address
                ? token.address
                : weth.address

            assert.equal(
                expectedToken0,
                token0
            );

            assert.equal(
                expectedToken1,
                token1
            );
        });

        it("should revert if pair already exists", async () => {

            await expectRevert(
                factory.createPair(
                    token.address,
                    weth.address
                ),
                "SwapsFactory: PAIR_ALREADY_EXISTS"
            );
        });

        it("should not allow to create pair for identical tokens", async () => {
            await expectRevert(
                factory.createPair(
                    token.address,
                    token.address
                ),
                "SwapsFactory: IDENTICAL"
            );
        });

        it("should not allow to create pair for zero address", async () => {

            await expectRevert(
                factory.createPair(
                    token.address,
                    ZERO_ADDRESS
                ),
                "SwapsFactory: ZERO_ADDRESS"
            );

            await expectRevert(
                factory.createPair(
                    ZERO_ADDRESS,
                    token.address
                ),
                "SwapsFactory: ZERO_ADDRESS"
            );

            await expectRevert(
                factory.createPair(
                    ZERO_ADDRESS,
                    ZERO_ADDRESS,
                ),
                "SwapsFactory: IDENTICAL"
            );
        });

        it("should have correct token0 and token1 values in pair contract", async () => {

            await factory.createPair(
                token.address,
                token2.address
            );

            let { token0, token1, pair } = await getLastEvent(
                "PairCreated",
                factory
            );

            pair = await SwapsPair.at(pair);

            const token0Value = await pair.token0();
            const token1Value = await pair.token1();

            const price0CumulativeLast = await pair.price0CumulativeLast();
            const price1CumulativeLast = await pair.price1CumulativeLast();

            const kLast = await pair.kLast();
            const getReserves = await pair.getReserves();

            const expectedToken0 = parseInt(token.address) > parseInt(token2.address)
                ? token2.address
                : token.address

            const expectedToken1 = parseInt(token.address) > parseInt(token2.address)
                ? token.address
                : token2.address

            assert.equal(
                token0Value,
                expectedToken0
            );

            assert.equal(
                token1Value,
                expectedToken1
            );
        });

        it("should increment allPairsLength", async () => {

            const lengthBefore = await factory.allPairsLength();

            await factory.createPair(
                token2.address,
                token3.address
            );

            const lengthAfter = await factory.allPairsLength();

            assert.equal(
                parseInt(lengthBefore) + 1,
                parseInt(lengthAfter)
            );
        });
    });

    describe("Router Liquidity", () => {

        it("should be able to addLiquidity (Tokens)", async () => {

            const depositAmount = FIVE_TOKENS;

            await token.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            await token2.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            await router.addLiquidity(
                token.address,
                token2.address,
                depositAmount,
                depositAmount,
                1,
                1,
                owner,
                170000000000,
                {from: owner}
            );

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                token2.address
            );

            pair = await SwapsPair.at(pairAddress);

            tokenBalance = await token.balanceOf(pairAddress);
            token2Balance = await token2.balanceOf(pairAddress);

            liquidityTokens = await pair.balanceOf(owner);

            assert.isAbove(
                parseInt(liquidityTokens),
                parseInt(0)
            );

            assert.equal(
                tokenBalance,
                depositAmount
            );

            assert.equal(
                token2Balance,
                depositAmount
            );
        });

        it("should be able to addLiquidityETH (Ether)", async () => {

            const depositAmount = FIVE_ETH;

            await token.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            await router.addLiquidityETH(
                token.address,
                STATIC_SUPPLY,
                0,
                0,
                owner,
                170000000000,
                {from: owner, value: depositAmount}
            );

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                weth.address
            );

            pair = await SwapsPair.at(pairAddress);
            wethBalance = await weth.balanceOf(pairAddress);
            tokenBalance = await token.balanceOf(pairAddress);

            liquidityTokens = await pair.balanceOf(owner);

            assert.isAbove(
                parseInt(liquidityTokens),
                parseInt(0)
            );

            assert.equal(
                tokenBalance,
                STATIC_SUPPLY
            );

            assert.equal(
                wethBalance,
                depositAmount
            );
        });

        it("should be able to removeLiquidity (Tokens)", async () => {

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                token2.address
            );

            pair = await SwapsPair.at(pairAddress);
            ownersBalance = await pair.balanceOf(owner);

            assert.isAbove(
                parseInt(ownersBalance),
                0
            );

            await pair.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            const allowance = await pair.allowance(
                owner,
                router.address
            );

            assert.equal(
                allowance.toString(),
                APPROVE_VALUE_MAX.toString()
            );

            await router.removeLiquidity(
                token.address,
                token2.address,
                ownersBalance,
                0,
                0,
                owner,
                1700000000000
            );
        });

        it("should be able to removeLiquidityETH (Ether)", async () => {

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                weth.address
            );

            pair = await SwapsPair.at(pairAddress);
            ownersBalance = await pair.balanceOf(owner);

            assert.isAbove(
                parseInt(ownersBalance),
                0
            );

            await pair.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            const allowance = await pair.allowance(
                owner,
                router.address
            );

            assert.equal(
                allowance.toString(),
                APPROVE_VALUE_MAX.toString()
            );

            await router.removeLiquidityETH(
                token.address,
                ownersBalance,
                0,
                0,
                owner,
                1700000000000
            );
        });
    });

    describe("Router Swap", () => {

        it("should be able to perform a swap (ETH > ERC20)", async () => {

            const depositAmount = FIVE_ETH;
            const swapAmount = FOUR_ETH;

            await token.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            await router.addLiquidityETH(
                token.address,
                STATIC_SUPPLY,
                0,
                0,
                owner,
                170000000000,
                {from: owner, value: depositAmount}
            );

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                weth.address
            );

            wethBalanceBefore = await weth.balanceOf(pairAddress);

            const path = [
                weth.address,
                token.address
            ];

            await router.swapExactETHForTokens(
                0,
                path,
                owner,
                1700000000000,
                {
                    from: owner,
                    value: swapAmount
                }
            );

            wethBalanceAfter = await weth.balanceOf(pairAddress);

            assert.equal(
                parseInt(wethBalanceBefore) + parseInt(swapAmount),
                parseInt(wethBalanceAfter)
            );
        });

        it("should be able to perform swapExactETHForTokensSupportingFeeOnTransferTokens", async () => {

            const depositAmount = FIVE_ETH;
            const swapAmount = FOUR_ETH;

            const path = [
                weth.address,
                token.address
            ];

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                weth.address
            );

            wethBalanceBefore = await weth.balanceOf(
                pairAddress
            );

            await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                path,
                owner,
                1700000000000,
                {
                    from: owner,
                    value: swapAmount
                }
            );

            wethBalanceAfter = await weth.balanceOf(
                pairAddress
            );

            assert.equal(
                parseInt(wethBalanceBefore) + parseInt(swapAmount),
                parseInt(wethBalanceAfter)
            );
        });

        it("should be able to perform a swap (exact ERC20 > ETH)", async () => {

            const depositAmount = FIVE_ETH;
            const swapAmount = FOUR_ETH;

            await token.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            await router.addLiquidityETH(
                token.address,
                STATIC_SUPPLY,
                0,
                0,
                owner,
                170000000000,
                {
                    from: owner,
                    value: depositAmount
                }
            );

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                weth.address
            );

            tokenBalanceBefore = await token.balanceOf(
                pairAddress
            );

            const path = [
                token.address,
                weth.address
            ];

            await router.swapExactTokensForETH(
                swapAmount,
                0,
                path,
                owner,
                1700000000000,
                {
                    from: owner
                }
            );

            tokenBalanceAfter = await token.balanceOf(
                pairAddress
            );

            assert.equal(
                parseInt(tokenBalanceBefore) + parseInt(swapAmount),
                parseInt(tokenBalanceAfter)
            );
        });

        it("should be able to perform swapExactTokensForETHSupportingFeeOnTransferTokens)", async () => {

            const depositAmount = FIVE_ETH;
            const swapAmount = FOUR_ETH;

            const path = [
                token.address,
                weth.address
            ];

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                weth.address
            );

            tokenBalanceBefore = await token.balanceOf(
                pairAddress
            );

            await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
                swapAmount,
                0,
                path,
                owner,
                1700000000000,
                {
                    from: owner
                }
            );

            tokenBalanceAfter = await token.balanceOf(
                pairAddress
            );

            assert.equal(
                parseInt(tokenBalanceBefore) + parseInt(swapAmount),
                parseInt(tokenBalanceAfter)
            );
        });

        it("should be able to perform a swap (ERC20 > ETH exact)", async () => {

            const depositAmount = FIVE_ETH;
            const swapAmount = FOUR_ETH;

            await token.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            await router.addLiquidityETH(
                token.address,
                STATIC_SUPPLY,
                0,
                0,
                owner,
                170000000000,
                {
                    from: owner,
                    value: depositAmount
                }
            );

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                weth.address
            );

            const path = [
                token.address,
                weth.address
            ];

            await expectRevert(
                router.swapTokensForExactETH(
                    ONE_ETH,
                    FOUR_ETH,
                    path,
                    owner,
                    1700000000000,
                    {
                        from: owner
                    }
                ),
                'EXCESSIVE_INPUT_AMOUNT'
            );

            await router.swapTokensForExactETH(
                100000000,
                NINE_ETH,
                path,
                owner,
                1700000000000,
                {
                    from: owner
                }
            );

            tokenBalanceBefore = await token.balanceOf(
                pairAddress
            );

            const swapAmountTokens = ONE_TOKEN;

            await expectRevert(
                router.swapETHForExactTokens(
                    swapAmountTokens,
                    path,
                    owner,
                    1700000000000,
                    {
                        value: FOUR_ETH,
                        from: owner
                    }
                ),
                'INVALID_PATH'
            );

            const correctPath = [
                weth.address,
                token.address
            ];

            await router.swapETHForExactTokens(
                swapAmountTokens,
                correctPath,
                owner,
                1700000000000,
                {
                    value: FOUR_ETH,
                    from: owner
                }
            ),

            tokenBalanceAfter = await token.balanceOf(
                pairAddress
            );

            assert.equal(
                parseInt(tokenBalanceBefore),
                parseInt(tokenBalanceAfter) + parseInt(swapAmountTokens)
            );
        });

        it("should be able to perform a swap (ERC20 > ERC20)", async () => {

            const depositAmount = FOUR_TOKENS;
            const swapAmount = ONE_TOKEN;

            await token.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            await token2.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            await router.addLiquidity(
                token.address,
                token2.address,
                depositAmount,
                depositAmount,
                1,
                1,
                owner,
                170000000000
            );

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                token2.address
            );

            tokenBalanceBefore = await token.balanceOf(
                pairAddress
            );

            const path = [
                token.address,
                token2.address
            ];

            await router.swapExactTokensForTokens(
                swapAmount,
                0,
                path,
                owner,
                1700000000000
            );

            tokenBalanceAfter = await token.balanceOf(
                pairAddress
            );

            assert.equal(
                parseInt(tokenBalanceBefore) + parseInt(swapAmount),
                parseInt(tokenBalanceAfter)
            );

            tokenBalanceBefore = await token.balanceOf(
                pairAddress
            );

            await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                swapAmount,
                0,
                path,
                owner,
                1700000000000
            );

            tokenBalanceAfter = await token.balanceOf(
                pairAddress
            );

            assert.equal(
                parseInt(tokenBalanceBefore) + parseInt(swapAmount),
                parseInt(tokenBalanceAfter)
            );
        });

        it("should be able to perform a swap (ERC20 > ERC20)", async () => {

            const depositAmount = FIVE_TOKENS;
            const swapAmount = ONE_TOKEN;

            await token.approve(
                router.address,
                APPROVE_VALUE_MAX
            );

            await token2.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            await router.addLiquidity(
                token.address,
                token2.address,
                depositAmount,
                depositAmount,
                1,
                1,
                owner,
                170000000000
            );

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                token2.address
            );

            tokenBalanceBefore = await token2.balanceOf(
                pairAddress
            );

            const path = [
                token.address,
                token2.address
            ];

            await router.swapTokensForExactTokens(
                swapAmount,
                depositAmount,
                path,
                owner,
                1700000000000
            );

            tokenBalanceAfter = await token2.balanceOf(
                pairAddress
            );

            assert.equal(
                parseInt(tokenBalanceBefore),
                parseInt(tokenBalanceAfter) + parseInt(swapAmount)
            );

            await expectRevert(
                router.swapTokensForExactTokens(
                    swapAmount,
                    depositAmount,
                    path,
                    owner,
                    0
                ),
                'SwapsRouter: DEADLINE_EXPIRED'
            );
        });

        it("should revert if path is invalid", async () => {

            const swapAmount = ONE_TOKEN;
            const depositAmount = ONE_TOKEN;

            const path = [
                token.address
            ];

            await expectRevert(
                router.swapTokensForExactTokens(
                    swapAmount,
                    depositAmount,
                    path,
                    owner,
                    1700000000000
                ),
                'INVALID_PATH'
            );
        });
    });

    describe("Swaps Pair", () => {

        it("revert if invalid permit()", async function () {

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                weth.address
            );

            pair = await SwapsPair.at(
                pairAddress
            );

            const approve = {
                owner: owner,
                spender: bob,
                value: 100,
            }

            // deadline as much as you want in the future
            const deadline = 100000000000000;
            const nonce = await pair.nonces(owner);

            const r = '0x7465737400000000000000000000000000000000000000000000000000000000';
            const s = '0x7465737400000000000000000000000000000000000000000000000000000000';

            await expectRevert(
                pair.permit(
                    '0x0000000000000000000000000000000000000000',
                    approve.spender,
                    approve.value,
                    deadline,
                    '0x99',
                    r,
                    s
                ),
                'SwapsERC20: INVALID_SIGNATURE'
            );
        });

        it("revert if invalid deadline", async function () {

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                weth.address
            );

            pair = await SwapsPair.at(
                pairAddress
            );

            const approve = {
                owner: owner,
                spender: bob,
                value: 100,
            }

            // deadline as much as you want in the future
            const deadline = 0;
            const nonce = await pair.nonces(owner);

            const r = '0x7465737400000000000000000000000000000000000000000000000000000000';
            const s = '0x7465737400000000000000000000000000000000000000000000000000000000';

            await expectRevert(
                pair.permit(
                    '0x0000000000000000000000000000000000000000',
                    approve.spender,
                    approve.value,
                    deadline,
                    '0x99',
                    r,
                    s
                ),
                'PERMIT_CALL_EXPIRED'
            );
        });

        /*it.skip("allows the spender claim the allowance signed by the owner", async function () {

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                weth.address
            );

            pair = await SwapsPair.at(
                pairAddress
            );

            const approve = {
                owner: owner,
                spender: bob,
                value: new BN("100"),
            }

            const deadline = new BN("100000000000000");

            const name = await pair.name();
            const nonce = await pair.nonces(owner);

            const digest = await getPermitDigest(
                pair,
                approve,
                nonce,
                deadline
            );

            console.log(digest, 'digest');

            const ownerPrivateKey = '9450712552098aa8553c5a4f9a7c0d206588a09198135782bc7101f72f0ed25d';

            const { v, r, s } = sign(
                digest,
                ownerPrivateKey
            );

            // Approve it
            const receipt = await pair.permit(
                approve.owner,
                approve.spender,
                approve.value,
                deadline,
                v,
                r,
                s
            );

            const event = receipt.logs[0];

            assert.equal(
                event.event,
                'Approval'
            );

            assert.equal(
                await token.nonces(owner),
                1
            );

            assert.equal(
                await token.allowance(approve.owner, approve.spender),
                approve.value
            );

            await catchRevert(
                token.permit(
                    approve.owner,
                    approve.spender,
                    approve.value,
                    deadline,
                    v,
                    r,
                    s
                ),
                'ERC20Permit: invalid signature'
            );
        });*/

        it("should allow to perform skim() operation retrieve stuck tokens", async () => {

            const depositAmount = FIVE_TOKENS;

            const feeTo = await factory.feeTo();
            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                token2.address
            );

            pair = await SwapsPair.at(
                pairAddress
            );

            await token.transfer(
                pair.address,
                depositAmount,
                {
                    from: owner
                }
            );

            const balanceBefore = await token.balanceOf(feeTo);

            await pair.skim();

            const balanceAfter = await token.balanceOf(feeTo);

            assert.equal(
                parseInt(balanceBefore) + parseInt(depositAmount),
                parseInt(balanceAfter)
            );
        });

    });

    describe("Swaps Pair", () => {

        it("should have correct total supply", async () => {
            const depositAmount = FIVE_TOKENS;

            await token.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            await token2.approve(
                router.address,
                APPROVE_VALUE_MAX,
                {from: owner}
            );

            await router.addLiquidity(
                token.address,
                token2.address,
                depositAmount,
                depositAmount,
                1,
                1,
                owner,
                170000000000,
                {from: owner}
            );

            const pairAddress = await router.pairFor(
                factory.address,
                token.address,
                token2.address
            );

            pair = await SwapsPair.at(pairAddress);

            const supply = await pair.totalSupply();
            const ownerBalance = await pair.balanceOf(owner);

            assert.isAbove(
                parseInt(supply),
                0
            );
        });

        it("should have correct name", async () => {
            const name = await pair.name();

            assert.equal(
                name,
                "Verse Exchange"
            );
        });

        it("should have correct symbol", async () => {
            const symbol = await pair.symbol();

            assert.equal(
                symbol,
                "VERSE-X"
            );
        });

        it("should have correct decimals", async () => {
            const decimals = await pair.decimals();

            assert.equal(
                decimals,
                18
            );
        });

        it("should return correct balance for account", async () => {

            const expectedAmount = ONE_TOKEN;

            await pair.transfer(
                alice,
                expectedAmount,
                {
                    from: owner
                }
            );

            const balance = await pair.balanceOf(alice);

            assert.equal(
                parseInt(balance),
                parseInt(expectedAmount)
            );
        });

        it("should give the correct allowance for the given spender", async () => {

            const allowance = await pair.allowance(
                owner,
                bob
            );

            assert.equal(
                allowance,
                0
            );
        });

        it("should return correct PERMIT_TYPEHASH", async () => {
            const expectedHash = web3.utils.keccak256(
                "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
            );
            const hashInContract = await pair.PERMIT_TYPEHASH();
            assert.equal(
                hashInContract,
                expectedHash
            );
        });

        it("on approve should emit correct Approval event", async () => {
            const transferValue = ONE_TOKEN;

            await pair.approve(
                bob,
                transferValue,
                {
                    from: owner
                }
            );

            const { owner: transferOwner, spender, value } = await getLastEvent(
                "Approval",
                pair
            );

            assert.equal(
                transferOwner,
                owner
            );

            assert.equal(
                spender,
                bob
            );

            assert.equal(
                transferValue,
                value
            );
        });

        it("on transfer should emit correct Transfer event", async () => {
            const transferValue = ONE_TOKEN;
            const expectedRecepient = bob;

            await pair.transfer(
                expectedRecepient,
                transferValue,
                {
                    from: owner
                }
            );

            const { from, to, value } = await getLastEvent(
                "Transfer",
                pair
            );

            assert.equal(
                from,
                owner
            );

            assert.equal(
                to,
                expectedRecepient
            );

            assert.equal(
                value,
                transferValue
            );
        });

        it("should transfer correct amount from walletA to walletB", async () => {

            const transferValue = ONE_TOKEN;
            const balanceBefore = await　pair.balanceOf(bob);
            const ownerBalanceBefore = await pair.balanceOf(owner);

            await pair.transfer(
                bob,
                transferValue,
                {
                    from: owner
                }
            );

            const balanceAfter = await pair.balanceOf(bob);
            const ownerBalanceAfter = await pair.balanceOf(owner);

            assert.equal(
                (new BN(balanceAfter)).toString(),
                (new BN(balanceBefore).add(new BN(transferValue))).toString()
            );

            assert.equal(
                (new BN(ownerBalanceAfter)).toString(),
                (new BN(ownerBalanceBefore).sub(new BN(transferValue))).toString()
            );
        });

        it("should revert if not enough balance in the wallet", async () => {
            await expectRevert.unspecified(
                pair.transfer(
                    alice,
                    ONE_TOKEN,
                    {
                        from: random
                    }
                )
            );
        });

        it("should increase allowance of wallet", async () => {

            const approvalValue = ONE_TOKEN;

            await pair.approve(
                bob,
                approvalValue,
                {
                    from: owner
                }
            );

            const allowanceValue = await pair.allowance(
                owner,
                bob
            );

            assert.equal(
                approvalValue,
                allowanceValue
            );
        });

        it("transferFrom should deduct correct amount from sender", async () => {

            const transferValue = ONE_TOKEN;
            const expectedRecipient = bob;
            const expectedExecuter = alice;

            await pair.approve(
                expectedExecuter,
                transferValue
            );

            const balanceBefore = await pair.balanceOf(owner);
            const allowanceBefore = await pair.allowance(
                owner,
                expectedExecuter
            );

            await pair.transferFrom(
                owner,
                expectedRecipient,
                transferValue,
                { from : expectedExecuter }
            );

            const balanceAfter = await pair.balanceOf(owner);
            const allowanceAfter = await pair.allowance(
                owner,
                expectedExecuter
            );

            assert.equal(
                (new BN(balanceAfter)).toString(),
                (new BN(balanceBefore).sub(new BN(transferValue))).toString()
            );

            assert.equal(
                (new BN(allowanceAfter)).toString(),
                (new BN(allowanceBefore).sub(new BN(transferValue))).toString()
            );
        });

        it("transferFrom should add correct amount to receiver", async () => {
            const transferValue = ONE_TOKEN;
            const expectedRecipient = alice;
            const balanceBefore = await pair.balanceOf(alice);

            await pair.approve(
                owner,
                transferValue
            );

            await pair.transferFrom(
                owner,
                expectedRecipient,
                transferValue,
            );

            const balanceAfter = await pair.balanceOf(alice);

            assert.equal(
                parseInt(balanceAfter),
                parseInt(balanceBefore) + parseInt(transferValue)
            );
        });

        it("transferFrom should not reduce approval if max value is used", async () => {

            const transferValue = ONE_TOKEN;
            const expectedRecipient = bob;
            const expectedExecuter = alice;

            await pair.approve(
                expectedExecuter,
                APPROVE_VALUE_MAX
            );

            const balanceBefore = await pair.balanceOf(owner);
            const allowanceBefore = await pair.allowance(
                owner,
                expectedExecuter
            );

            await pair.transferFrom(
                owner,
                expectedRecipient,
                transferValue,
                { from : expectedExecuter }
            );

            const balanceAfter = await pair.balanceOf(owner);
            const allowanceAfter = await pair.allowance(
                owner,
                expectedExecuter
            );

            assert.equal(
                (new BN(balanceAfter)).toString(),
                (new BN(balanceBefore).sub(new BN(transferValue))).toString()
            );

            assert.equal(
                (new BN(allowanceAfter)).toString(),
                (new BN(allowanceBefore)).toString()
            );
        });

        it("should revert if there is no approval when using transferFrom", async () => {
            const transferValue = ONE_TOKEN;
            await expectRevert.unspecified(
                pair.transferFrom(
                    bob,
                    owner,
                    transferValue, {
                        from: alice
                    }
                )
            );
        });
    });
});
