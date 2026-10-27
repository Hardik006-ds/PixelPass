// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PixelPass
/// @notice Concert-only ticketing. Every ticket is an ERC-721 token with a
///         stored fingerprint (ticketHash), a seat number and a used flag.
///         Includes gate staff check-in and a price-capped resale market.
/// @dev Money is never pushed during a purchase. It is credited to a balance
///      and the receiver pulls it later with withdraw() (pull payments).
contract PixelPass is ERC721, ERC721Enumerable, Ownable, ReentrancyGuard {
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    /// @notice The three seat tiers of every concert.
    enum Tier {
        GA,
        VIP,
        FRONT_ROW
    }

    uint8 public constant TIER_COUNT = 3;
    uint256 public constant DEFAULT_RESALE_CAP_PERCENT = 110;
    uint256 public constant MAX_RESALE_CAP_PERCENT = 500;

    struct Concert {
        uint256 id;
        string name;
        string artist;
        string venue;
        uint256 dateTime; // unix seconds
        address organizer;
        bool active;
        uint256 resaleCapPercent; // 110 means resale up to 110% of face value
        uint256[3] tierPrices; // wei, index = Tier
        uint256[3] tierCapacities;
        uint256[3] tierSold;
    }

    struct Ticket {
        uint256 concertId;
        uint8 tier;
        uint256 seatNumber; // sequential inside the tier, starts at 1
        uint256 originalPrice; // wei paid at mint
        bytes32 ticketHash; // keccak256(abi.encode(concertId, tokenId, tier, seatNumber, originalPrice))
        bool used;
        uint256 mintedAt;
    }

    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    Concert[] private _concerts; // concert id = index
    mapping(uint256 => Ticket) private _tickets; // tokenId => ticket
    mapping(uint256 => Listing) private _listings; // tokenId => listing
    mapping(address => bool) public isGateStaff;
    mapping(address => uint256) public pendingWithdrawals; // pull payment balances

    uint256 private _nextTokenId = 1; // token ids start at 1, so 0 is never a real ticket

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event ConcertCreated(
        uint256 indexed concertId,
        string name,
        string artist,
        string venue,
        uint256 dateTime,
        uint256 resaleCapPercent
    );
    event ConcertStatusChanged(uint256 indexed concertId, bool active);
    event TicketMinted(
        uint256 indexed tokenId,
        uint256 indexed concertId,
        address indexed buyer,
        uint8 tier,
        uint256 seatNumber,
        uint256 price,
        bytes32 ticketHash
    );
    event TicketUsed(uint256 indexed tokenId, uint256 indexed concertId, address indexed checkedInBy);
    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ListingCancelled(uint256 indexed tokenId);
    event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);
    event BalanceCredited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event GateStaffAdded(address indexed staff);
    event GateStaffRemoved(address indexed staff);

    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------

    error ConcertDoesNotExist(uint256 concertId);
    error ConcertNotActive(uint256 concertId);
    error ConcertNotUpcoming(uint256 concertId);
    error DateMustBeInFuture();
    error InvalidCapacity();
    error InvalidPrice();
    error InvalidResaleCap();
    error EmptyText();
    error InvalidTier(uint8 tier);
    error TierSoldOut(uint256 concertId, uint8 tier);
    error WrongPayment(uint256 expected, uint256 sent);
    error TicketDoesNotExist(uint256 tokenId);
    error TicketAlreadyUsed(uint256 tokenId);
    error NotTicketOwner(uint256 tokenId);
    error NotGateStaff(address account);
    error PriceAboveResaleCap(uint256 price, uint256 cap);
    error NotListed(uint256 tokenId);
    error CannotBuyOwnListing(uint256 tokenId);
    error NothingToWithdraw();
    error WithdrawFailed();
    error ZeroAddress();

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------

    modifier onlyOwnerOrStaff() {
        if (msg.sender != owner() && !isGateStaff[msg.sender]) revert NotGateStaff(msg.sender);
        _;
    }

    constructor() ERC721("PixelPass Concert Ticket", "PXP") Ownable(msg.sender) {}

    // ------------------------------------------------------------------
    // Organizer: concerts
    // ------------------------------------------------------------------

    /// @notice Create a new concert with three tiers (GA, VIP, FRONT_ROW).
    /// @param resaleCapPercent 0 means the default (110). Otherwise 100 to 500.
    function createConcert(
        string calldata name,
        string calldata artist,
        string calldata venue,
        uint256 dateTime,
        uint256[3] calldata tierPrices,
        uint256[3] calldata tierCapacities,
        uint256 resaleCapPercent
    ) external onlyOwner returns (uint256 concertId) {
        if (bytes(name).length == 0 || bytes(artist).length == 0 || bytes(venue).length == 0) revert EmptyText();
        if (dateTime <= block.timestamp) revert DateMustBeInFuture();
        for (uint256 i = 0; i < TIER_COUNT; i++) {
            if (tierCapacities[i] == 0) revert InvalidCapacity();
            if (tierPrices[i] == 0) revert InvalidPrice();
        }
        uint256 cap = resaleCapPercent == 0 ? DEFAULT_RESALE_CAP_PERCENT : resaleCapPercent;
        if (cap < 100 || cap > MAX_RESALE_CAP_PERCENT) revert InvalidResaleCap();

        concertId = _concerts.length;
        Concert storage c = _concerts.push();
        c.id = concertId;
        c.name = name;
        c.artist = artist;
        c.venue = venue;
        c.dateTime = dateTime;
        c.organizer = owner();
        c.active = true;
        c.resaleCapPercent = cap;
        c.tierPrices = tierPrices;
        c.tierCapacities = tierCapacities;

        emit ConcertCreated(concertId, name, artist, venue, dateTime, cap);
    }

    /// @notice Pause or resume a concert (for example if it is cancelled).
    function setConcertActive(uint256 concertId, bool active) external onlyOwner {
        Concert storage c = _getConcert(concertId);
        c.active = active;
        emit ConcertStatusChanged(concertId, active);
    }

    // ------------------------------------------------------------------
    // Fans: primary sale
    // ------------------------------------------------------------------

    /// @notice Buy one ticket for a tier. Send exactly the tier price.
    function buyTicket(uint256 concertId, uint8 tier) external payable nonReentrant returns (uint256 tokenId) {
        // Checks
        Concert storage c = _getConcert(concertId);
        if (!c.active) revert ConcertNotActive(concertId);
        if (c.dateTime <= block.timestamp) revert ConcertNotUpcoming(concertId);
        if (tier >= TIER_COUNT) revert InvalidTier(tier);
        if (c.tierSold[tier] >= c.tierCapacities[tier]) revert TierSoldOut(concertId, tier);
        uint256 price = c.tierPrices[tier];
        if (msg.value != price) revert WrongPayment(price, msg.value);

        // Effects
        tokenId = _nextTokenId++;
        uint256 seatNumber = ++c.tierSold[tier];
        bytes32 h = computeHash(concertId, tokenId, tier, seatNumber, price);
        _tickets[tokenId] = Ticket({
            concertId: concertId,
            tier: tier,
            seatNumber: seatNumber,
            originalPrice: price,
            ticketHash: h,
            used: false,
            mintedAt: block.timestamp
        });
        pendingWithdrawals[c.organizer] += price;
        emit BalanceCredited(c.organizer, price);

        // Interactions: _mint does not call the receiver, so there is no external call here.
        _mint(msg.sender, tokenId);
        emit TicketMinted(tokenId, concertId, msg.sender, tier, seatNumber, price, h);
    }

    // ------------------------------------------------------------------
    // Gate staff
    // ------------------------------------------------------------------

    function addGateStaff(address staff) external onlyOwner {
        if (staff == address(0)) revert ZeroAddress();
        isGateStaff[staff] = true;
        emit GateStaffAdded(staff);
    }

    function removeGateStaff(address staff) external onlyOwner {
        if (staff == address(0)) revert ZeroAddress();
        isGateStaff[staff] = false;
        emit GateStaffRemoved(staff);
    }

    /// @notice Check a ticket in at the gate. A used ticket can never move again.
    function markUsed(uint256 tokenId) external onlyOwnerOrStaff {
        if (_ownerOf(tokenId) == address(0)) revert TicketDoesNotExist(tokenId);
        Ticket storage t = _tickets[tokenId];
        if (t.used) revert TicketAlreadyUsed(tokenId);
        if (!_concerts[t.concertId].active) revert ConcertNotActive(t.concertId);

        t.used = true;
        if (_listings[tokenId].active) {
            delete _listings[tokenId];
            emit ListingCancelled(tokenId);
        }
        emit TicketUsed(tokenId, t.concertId, msg.sender);
    }

    // ------------------------------------------------------------------
    // Resale market
    // ------------------------------------------------------------------

    /// @notice Highest resale price allowed for a ticket.
    function resaleCap(uint256 tokenId) public view returns (uint256) {
        if (_ownerOf(tokenId) == address(0)) revert TicketDoesNotExist(tokenId);
        Ticket storage t = _tickets[tokenId];
        return (t.originalPrice * _concerts[t.concertId].resaleCapPercent) / 100;
    }

    function listForResale(uint256 tokenId, uint256 price) external {
        address holder = _ownerOf(tokenId);
        if (holder == address(0)) revert TicketDoesNotExist(tokenId);
        if (holder != msg.sender) revert NotTicketOwner(tokenId);
        Ticket storage t = _tickets[tokenId];
        if (t.used) revert TicketAlreadyUsed(tokenId);
        Concert storage c = _concerts[t.concertId];
        if (!c.active) revert ConcertNotActive(t.concertId);
        if (c.dateTime <= block.timestamp) revert ConcertNotUpcoming(t.concertId);
        if (price == 0) revert InvalidPrice();
        uint256 cap = (t.originalPrice * c.resaleCapPercent) / 100;
        if (price > cap) revert PriceAboveResaleCap(price, cap);

        _listings[tokenId] = Listing({seller: msg.sender, price: price, active: true});
        emit Listed(tokenId, msg.sender, price);
    }

    function cancelListing(uint256 tokenId) external {
        Listing storage l = _listings[tokenId];
        if (!l.active) revert NotListed(tokenId);
        if (l.seller != msg.sender) revert NotTicketOwner(tokenId);
        delete _listings[tokenId];
        emit ListingCancelled(tokenId);
    }

    /// @notice Buy a listed ticket. The seller is paid through a pull balance.
    function buyResale(uint256 tokenId) external payable nonReentrant {
        // Checks
        Listing memory l = _listings[tokenId];
        if (!l.active) revert NotListed(tokenId);
        if (l.seller == msg.sender) revert CannotBuyOwnListing(tokenId);
        Ticket storage t = _tickets[tokenId];
        if (t.used) revert TicketAlreadyUsed(tokenId);
        Concert storage c = _concerts[t.concertId];
        if (!c.active) revert ConcertNotActive(t.concertId);
        if (c.dateTime <= block.timestamp) revert ConcertNotUpcoming(t.concertId);
        if (msg.value != l.price) revert WrongPayment(l.price, msg.value);

        // Effects
        delete _listings[tokenId];
        pendingWithdrawals[l.seller] += l.price;
        emit BalanceCredited(l.seller, l.price);

        // Internal transfer (no receiver callback). The seller agreed by listing.
        _transfer(l.seller, msg.sender, tokenId);
        emit Sold(tokenId, l.seller, msg.sender, l.price);
    }

    // ------------------------------------------------------------------
    // Pull payments
    // ------------------------------------------------------------------

    /// @notice Withdraw your credited balance (organizer sales or resale income).
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        // Effects before the interaction (checks-effects-interactions).
        pendingWithdrawals[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }

    // ------------------------------------------------------------------
    // Hash helpers
    // ------------------------------------------------------------------

    /// @notice The ticket fingerprint formula. Anyone can recompute it off chain.
    function computeHash(
        uint256 concertId,
        uint256 tokenId,
        uint8 tier,
        uint256 seatNumber,
        uint256 originalPrice
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(concertId, tokenId, tier, seatNumber, originalPrice));
    }

    /// @notice True only if the supplied ticket data hashes to the stored ticketHash.
    /// @dev Returns false (never reverts) for tokens that do not exist, so fake tickets can be checked.
    function verifyTicketData(
        uint256 tokenId,
        uint256 concertId,
        uint8 tier,
        uint256 seatNumber,
        uint256 originalPrice
    ) external view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) return false;
        return _tickets[tokenId].ticketHash == computeHash(concertId, tokenId, tier, seatNumber, originalPrice);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function getConcert(uint256 concertId) external view returns (Concert memory) {
        if (concertId >= _concerts.length) revert ConcertDoesNotExist(concertId);
        return _concerts[concertId];
    }

    function getConcertCount() external view returns (uint256) {
        return _concerts.length;
    }

    function getTicket(uint256 tokenId) external view returns (Ticket memory) {
        if (_ownerOf(tokenId) == address(0)) revert TicketDoesNotExist(tokenId);
        return _tickets[tokenId];
    }

    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return _listings[tokenId];
    }

    /// @notice All token ids owned by an address (uses ERC721Enumerable).
    function getTicketsOf(address account) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(account);
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            ids[i] = tokenOfOwnerByIndex(account, i);
        }
    }

    /// @notice Every active resale listing. Fine for a demo sized market.
    function getActiveListings()
        external
        view
        returns (uint256[] memory tokenIds, address[] memory sellers, uint256[] memory prices)
    {
        uint256 total = totalSupply();
        uint256 count = 0;
        for (uint256 i = 0; i < total; i++) {
            if (_listings[tokenByIndex(i)].active) count++;
        }
        tokenIds = new uint256[](count);
        sellers = new address[](count);
        prices = new uint256[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < total; i++) {
            uint256 id = tokenByIndex(i);
            Listing storage l = _listings[id];
            if (l.active) {
                tokenIds[j] = id;
                sellers[j] = l.seller;
                prices[j] = l.price;
                j++;
            }
        }
    }

    /// @notice Quick status check used by the gate.
    function isValid(uint256 tokenId) external view returns (bool exists, address holder, bool used) {
        holder = _ownerOf(tokenId);
        exists = holder != address(0);
        used = exists && _tickets[tokenId].used;
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    function _getConcert(uint256 concertId) internal view returns (Concert storage) {
        if (concertId >= _concerts.length) revert ConcertDoesNotExist(concertId);
        return _concerts[concertId];
    }

    /// @dev OpenZeppelin 5 transfer hook. Runs on mint, transfer and burn.
    ///      Blocks any movement of a used ticket and clears an active listing on transfer.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0)) {
            if (_tickets[tokenId].used) revert TicketAlreadyUsed(tokenId);
            if (_listings[tokenId].active) {
                delete _listings[tokenId];
                emit ListingCancelled(tokenId);
            }
        }
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
