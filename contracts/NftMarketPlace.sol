// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

/**
 * @title Contract Walkthrough
 * 1. `listItem`: List NFTs on the marketplace.
 * After NFT is listed. Create Buy Function so people can buy it.
 * 2. `buyItem`: Buy the NFTs
 * 3. `cancelItem`: Cancel a listing
 * 4. `updateListing`: Update Price
 * 5. `withDrawProceeds`: Withdraw payment for my bought NFT
 * @notice Always gave money in the end of function. To protect your code from Re-entrancy Attack.
 * Always change the state (state change Ex:- "set Rohit's balance to 0 after he recieve the money") before calling external functions you might don't have control of or maybe your transfer function.
 */

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

error NftMarketplace__PriceMustBeAboveZero();
error NftMarketplace__NftNotApprovedForMarketplace();
error NftMarketplace__NftAlreadyListed(address nftAddress, uint256 tokenId);
error NftMarketplace__NotOwner();
error NftMarketplace__NftNotListed(address nftAddress, uint256 tokenId);
error NftMarketplace__PriceNotMet(address nftAddress, uint256 tokenId, uint256 price);
error NftMarketplace__NoProceeds();
error NftMarketplace__TransferFailed();

// error NftMarketplace__IsOwner();

contract NftMarketplace is ReentrancyGuard {
    ///////////
    // Types //
    ///////////
    struct Listing {
        uint256 price;
        address seller;
    }

    ///////////////
    // Variables //
    ///////////////
    // NFT Contract addresss => NFT TokenId => Listing
    mapping(address => mapping(uint256 => Listing)) private s_listings;

    // Mapping to keep track of "How much money people have made by selling their NFT"
    // Seller Address to Amount earned
    mapping(address => uint256) private s_proceeds;

    ////////////
    // Events //
    ////////////
    event ItemListed(
        address indexed seller,
        address indexed nftAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemBought(
        address indexed buyer,
        address indexed nftAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemCanceled(
        address indexed seller,
        address indexed nftAddress,
        uint256 indexed tokenId
    );

    ////////////////
    // Modifierss //
    ////////////////
    modifier notListed(
        address nftAddress,
        uint256 tokenId,
        address owner
    ) {
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (listing.price > 0) {
            revert NftMarketplace__NftAlreadyListed(nftAddress, tokenId);
        }
        _;
    }

    modifier isListed(address nftAddress, uint256 tokenId) {
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (listing.price <= 0) {
            revert NftMarketplace__NftNotListed(nftAddress, tokenId);
        }
        _;
    }

    modifier isOwner(
        address nftAddress,
        uint256 tokenId,
        address spender
    ) {
        IERC721 nft = IERC721(nftAddress);
        address owner = nft.ownerOf(tokenId);
        if (spender != owner) {
            revert NftMarketplace__NotOwner();
        }
        _;
    }

    // TODO \\ Uncomment this modifier if "Account-R can only able to buy the NFT that he listed"
    // modifier isNotOwner(
    //     address nftAddress,
    //     uint256 tokenId,
    //     address spender
    // ) {
    //     IERC721 nft = IERC721(nftAddress);
    //     address owner = nft.ownerOf(tokenId);
    //     if (spender == owner) {
    //         revert NftMarketplace__IsOwner();
    //     }
    //     _;
    // }

    ////////////////////
    // Main Functions //
    ////////////////////
    /**
     * @notice Owners can hold their NFT, and give the approval to marketplace  to sell the NFT for them.
     * @dev call the 'getApproved' function from IERC721.sol contract to give the approval to marketplace.
     * @dev Using "notListed" Modifier to make sure we never list a Already Listed NFT on marketplace.
     * @dev Using "isOwner" Modifier to make sure nft is only listed if spender is the owner.
     * @param nftAddress : Address of NFT contract
     * @param tokenId : TOkenId of NFT contract
     * @param price : Sale Price of NFT
     */
    function listItem(
        address nftAddress,
        uint256 tokenId,
        uint256 price
    )
        external
        notListed(nftAddress, tokenId, msg.sender)
        isOwner(nftAddress, tokenId, msg.sender)
    {
        if (price <= 0) {
            revert NftMarketplace__PriceMustBeAboveZero();
        }
        IERC721 nft = IERC721(nftAddress);
        // Whichever NFT TokenId is not approved for this contract to list, will not gonna be listed
        if (nft.getApproved(tokenId) != address(this)) {
            revert NftMarketplace__NftNotApprovedForMarketplace();
        }

        s_listings[nftAddress][tokenId] = Listing(price, msg.sender);
        emit ItemListed(msg.sender, nftAddress, tokenId, price);
    }

    /**
     * @notice Owner can cancel his NFT listing
     * @dev Using "isListed" to make sure NFT is listed
     */
    function cancelListing(address nftAddress, uint256 tokenId)
        external
        isOwner(nftAddress, tokenId, msg.sender)
        isListed(nftAddress, tokenId)
    {
        delete (s_listings[nftAddress][tokenId]);
        emit ItemCanceled(msg.sender, nftAddress, tokenId);
    }

    /**
     * @notice Function to buy listed NFTs on marketplace
     * @dev Using "isListed" Modifier to make sure the NFT is already listed
     * @dev 1st "if()" statement checks if buying value is greater than the "listed value of NFT" or not. If not then revert the transaction
     */
    function buyItem(address nftAddress, uint256 tokenId)
        external
        payable
        isListed(nftAddress, tokenId)
        nonReentrant // Saving from RE-entrancy attack
    // isNotOwner(nftAddress, tokenId, msg.sender)
    {
        Listing memory listedItem = s_listings[nftAddress][tokenId];
        if (msg.value < listedItem.price) {
            revert NftMarketplace__PriceNotMet(nftAddress, tokenId, listedItem.price);
        }
        // QUESTION \\ Why don't we just send the money to the seller
        // ANSWER \\ https://fravoll.github.io/solidity-patterns/pull_over_push.html
        // ANSWER \\ To shift the risk of money to the seller (Shift the risk associated with transferring ether to the user.)

        // update the proceeds(withdraw money) So, seller can withdraw it.
        s_proceeds[listedItem.seller] = s_proceeds[listedItem.seller] + msg.value;

        // Once someone buys the NFT, we're gonna have to delete the listing and mapping of that NFT
        delete (s_listings[nftAddress][tokenId]);

        // NOw Transfer the NFT from previous owner to new owner with tokenId
        // NOTE \\ Calling Transfer function in the end to protect from Re-entrancy attack
        IERC721(nftAddress).safeTransferFrom(listedItem.seller, msg.sender, tokenId);

        emit ItemBought(msg.sender, nftAddress, tokenId, listedItem.price);
    }

    /**
     * @notice Update the Listing Price of NFT
     */
    function updateListingPrice(
        address nftAddress,
        uint256 tokenId,
        uint256 newPrice
    )
        external
        isOwner(nftAddress, tokenId, msg.sender)
        nonReentrant
        isListed(nftAddress, tokenId)
    {
        //We should check the value of `newPrice` and revert if it's below zero (like how we checked in `listItem()`)
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (newPrice <= listing.price) {
            revert NftMarketplace__PriceMustBeAboveZero();
        }
        s_listings[nftAddress][tokenId].price = newPrice;

        // Relisting a NFT again with new price. So, we can use already written event to save gas
        emit ItemListed(msg.sender, nftAddress, tokenId, newPrice);
    }

    /**
     * @notice Method for withdrawing proceeds from sales
     */
    function withdrawProceeds() external nonReentrant {
        // getting all the money applicable to withdraw
        uint256 proceeds = s_proceeds[msg.sender];
        if (proceeds <= 0) {
            revert NftMarketplace__NoProceeds();
        }
        s_proceeds[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: proceeds}("");
        if (!success) {
            revert NftMarketplace__TransferFailed();
        }
    }

    //////////////////////
    // Getter Functions //
    //////////////////////

    function getListing(address nftAddress, uint256 tokenId)
        external
        view
        returns (Listing memory)
    {
        return s_listings[nftAddress][tokenId];
    }

    function getProceeds(address seller) external view returns (uint256) {
        return s_proceeds[seller];
    }
}
