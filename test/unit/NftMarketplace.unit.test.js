const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Nft Marketplace Unit Tests", function () {
          let nftMarketplace, nftMarketplaceContract, basicNft, basicNftContract
          const PRICE = ethers.utils.parseEther("0.1")
          const TOKEN_ID = 0

          beforeEach(async () => {
              accounts = await ethers.getSigners() // could also do with getNamedAccounts
              deployer = accounts[0]
              user = accounts[1]
              player = accounts[2]
              await deployments.fixture(["all"])
              nftMarketplaceContract = await ethers.getContract("NftMarketplace")
              nftMarketplace = nftMarketplaceContract.connect(deployer)
              basicNftContract = await ethers.getContract("BasicNft")
              basicNft = basicNftContract.connect(deployer)
              await basicNft.mintNft()
              await basicNft.approve(nftMarketplaceContract.address, TOKEN_ID)
          })

          describe("listItem", () => {
              it("will revert the transaction if the price is not greater than 0", async () => {
                  const priceOfNft = ethers.utils.parseEther("0")
                  await expect(
                      nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, priceOfNft)
                  ).to.be.revertedWith("NftMarketplace__PriceMustBeAboveZero")
              })
              it("checks if nftmarketplace have approval to list the nft", async () => {
                  await basicNft.approve(ethers.constants.AddressZero, TOKEN_ID)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotApprovedForMarketplace")
              })
              it("will emits the ItemListed", async () => {
                  expect(
                      await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  ).to.emit("ItemListed")
              })
              it("will revert if NFT is Already listed", async () => {
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  await expect(
                      nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NftAlreadyListed")
              })
              it("only Owner can List the NFT", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(user)
                  await basicNft.approve(user.address, TOKEN_ID)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })
              it("Updates listing with seller and price", async () => {
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  const listing = await nftMarketplace.getListing(
                      basicNftContract.address,
                      TOKEN_ID
                  )
                  assert(listing.price.toString() == PRICE.toString())
                  assert(listing.seller.toString() == deployer.address)
              })
          })

          describe("cancelListing", () => {
              it("will emit the ItemCanceled and remove the listing", async () => {
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  expect(
                      await nftMarketplace.cancelListing(basicNftContract.address, TOKEN_ID)
                  ).to.emit("ItemCanceled")
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == "0")
              })
              it("only owner can cancel the listing", async () => {
                  fakeOwner = await nftMarketplaceContract.connect(user)
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  await expect(
                      fakeOwner.cancelListing(basicNftContract.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })
              it("revert if there is no listing", async () => {
                  await expect(
                      nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace__NftNotListed")
              })
          })

          describe("buyItem", () => {
              it("reverts if the item isnt listed", async function () {
                  await expect(
                      nftMarketplace.buyItem(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NotListed")
              })
              it("will revert if buying value is lower than the listed price", async () => {
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  await expect(
                      nftMarketplace.buyItem(basicNftContract.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace__PriceNotMet")
              })
              it("transfers the nft to the buyer and updates internal proceeds record", async () => {
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  const buyer = await nftMarketplaceContract.connect(user)
                  expect(
                      await buyer.buyItem(basicNftContract.address, TOKEN_ID, {
                          value: PRICE,
                      })
                  ).to.emit("ItemBought")
                  const newOwner = await basicNft.ownerOf(TOKEN_ID)
                  assert(newOwner.toString(), buyer.address)
                  const proceeds = await nftMarketplace.getProceeds(buyer.address)
                  assert(proceeds.toString(), PRICE.toString())
              })
              it("will delete the list once it's bought", async () => {
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  await nftMarketplace.buyItem(basicNftContract.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  const listing = await nftMarketplace.getListing(
                      basicNftContract.address,
                      TOKEN_ID
                  )
                  assert(listing.price.toString(), "0")
              })
          })

          describe("withdrawProceeds", () => {
              it("will revert if there is no amount to proceed", async () => {
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith(
                      "NftMarketplace__NoProceeds"
                  )
              })
              it("seller's proceeds will go to 0 once it's withdrawal", async () => {
                  await nftMarketplace.listItem(basicNftContract.address, TOKEN_ID, PRICE)
                  const buyer = await nftMarketplaceContract.connect(user)
                  await buyer.buyItem(basicNftContract.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  await nftMarketplace.withdrawProceeds()
                  proceeds = await nftMarketplace.getProceeds(deployer.address)
                  assert(proceeds.toString(), "0")
              })
              it("withdraws proceeds", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplaceContract.connect(user)
                  await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  nftMarketplace = nftMarketplaceContract.connect(deployer)

                  const deployerProceedsBefore = await nftMarketplace.getProceeds(deployer.address)
                  const deployerBalanceBefore = await deployer.getBalance()
                  const txResponse = await nftMarketplace.withdrawProceeds()
                  const transactionReceipt = await txResponse.wait(1)
                  const { gasUsed, effectiveGasPrice } = transactionReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice)
                  const deployerBalanceAfter = await deployer.getBalance()

                  assert(
                      deployerBalanceAfter.add(gasCost).toString() ==
                          deployerProceedsBefore.add(deployerBalanceBefore).toString()
                  )
              })
          })

          describe("updateListingPricePrice", () => {
              it("will revert if updated value is less than or equal to 0", async () => {
                  const updatedPrice = ethers.utils.parseEther("0.001")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(
                      nftMarketplace.updateListingPrice(basicNft.address, TOKEN_ID, updatedPrice)
                  ).to.be.revertedWith("NftMarketplace__PriceMustBeAboveZero")
              })
              it("must be owner and listed", async function () {
                  await expect(
                      nftMarketplace.updateListingPrice(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotListed")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplaceContract.connect(user)
                  await expect(
                      nftMarketplace.updateListingPrice(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotOwner")
              })
              it("updates the price of the item", async function () {
                  const updatedPrice = ethers.utils.parseEther("0.2")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  expect(
                      await nftMarketplace.updateListingPrice(
                          basicNft.address,
                          TOKEN_ID,
                          updatedPrice
                      )
                  ).to.emit("ItemListed")
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == updatedPrice.toString())
              })
          })
      })
