const express = require('express');
const router = express.Router();
const Address = require('../models/Address');

// GET all addresses for a specific user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
    res.status(200).json(addresses);
  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(500).json({ message: 'Error fetching addresses', error: error.message });
  }
});

// POST - Add new address
router.post('/', async (req, res) => {
  try {
    const { userId, fullName, addressLine, city, state, pincode, mobile, alternateMobile, label, isDefault } = req.body;

    if (!userId || !fullName || !addressLine || !city || !state || !pincode || !mobile || !label) {
      return res.status(400).json({ message: 'All required fields must be filled' });
    }

    // Check if this is the first address of the user
    const existingCount = await Address.countDocuments({ userId });
    let finalIsDefault = isDefault;
    if (existingCount === 0) {
      finalIsDefault = true;
    }

    // If this address is set to default, unset other defaults
    if (finalIsDefault) {
      await Address.updateMany({ userId }, { isDefault: false });
    }

    const newAddress = new Address({
      userId,
      fullName,
      addressLine,
      city,
      state,
      pincode,
      mobile,
      alternateMobile: alternateMobile || '',
      label,
      isDefault: finalIsDefault
    });

    const savedAddress = await newAddress.save();
    res.status(201).json(savedAddress);
  } catch (error) {
    console.error('Error saving address:', error);
    res.status(500).json({ message: 'Error saving address', error: error.message });
  }
});

// PUT - Update address
router.put('/:addressId', async (req, res) => {
  try {
    const { addressId } = req.params;
    const { userId, fullName, addressLine, city, state, pincode, mobile, alternateMobile, label, isDefault } = req.body;

    if (!userId || !fullName || !addressLine || !city || !state || !pincode || !mobile || !label) {
      return res.status(400).json({ message: 'All required fields must be filled' });
    }

    // If setting to default, unset other defaults
    if (isDefault) {
      await Address.updateMany({ userId, _id: { $ne: addressId } }, { isDefault: false });
    }

    const updatedAddress = await Address.findByIdAndUpdate(
      addressId,
      { fullName, addressLine, city, state, pincode, mobile, alternateMobile: alternateMobile || '', label, isDefault },
      { new: true }
    );

    if (!updatedAddress) {
      return res.status(404).json({ message: 'Address not found' });
    }

    // If this was the only address, ensure it remains default
    const totalCount = await Address.countDocuments({ userId });
    if (totalCount === 1 && !updatedAddress.isDefault) {
      updatedAddress.isDefault = true;
      await updatedAddress.save();
    }

    res.status(200).json(updatedAddress);
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({ message: 'Error updating address', error: error.message });
  }
});

// DELETE - Delete address
router.delete('/:addressId', async (req, res) => {
  try {
    const { addressId } = req.params;
    
    // Find address to know its userId and default status
    const addressToDelete = await Address.findById(addressId);
    if (!addressToDelete) {
      return res.status(404).json({ message: 'Address not found' });
    }

    const { userId, isDefault } = addressToDelete;

    await Address.findByIdAndDelete(addressId);

    // If deleted address was default, make another one default
    if (isDefault) {
      const remainingAddress = await Address.findOne({ userId });
      if (remainingAddress) {
        remainingAddress.isDefault = true;
        await remainingAddress.save();
      }
    }

    res.status(200).json({ message: 'Address deleted successfully' });
  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({ message: 'Error deleting address', error: error.message });
  }
});

module.exports = router;
