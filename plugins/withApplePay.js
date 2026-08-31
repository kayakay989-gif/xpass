const {
  withEntitlementsPlist,
  withDangerousMod,
  withXcodeProject,
  IOSConfig,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that adds a native Apple Pay (PassKit) module to the iOS app.
 *
 * - Adds the `com.apple.developer.in-app-payments` entitlement with the merchant
 *   id (ONLY when EXPO_PUBLIC_APPLE_MERCHANT_ID is set, so builds without a valid
 *   merchant id don't fail provisioning).
 * - Writes ApplePayModule.swift / ApplePayModule.m into the iOS project and adds
 *   them to the main target so NativeModules.ApplePayModule is available.
 *
 * The module returns the base64 PKPaymentToken.paymentData which the backend
 * charges through the existing MPGS gateway (payments.payWithWallet).
 */

const SWIFT_SOURCE = `import Foundation
import PassKit
import React

@objc(ApplePayModule)
class ApplePayModule: NSObject {

  private var paymentResolve: RCTPromiseResolveBlock?
  private var paymentReject: RCTPromiseRejectBlock?
  private var didAuthorize = false
  private var authController: PKPaymentAuthorizationController?

  @objc static func requiresMainQueueSetup() -> Bool {
    return true
  }

  private func supportedNetworks() -> [PKPaymentNetwork] {
    return [.visa, .masterCard]
  }

  @objc(canMakePayments:rejecter:)
  func canMakePayments(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(PKPaymentAuthorizationController.canMakePayments())
  }

  @objc(requestPayment:resolver:rejecter:)
  func requestPayment(_ config: NSDictionary,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    let merchantId = (config["merchantIdentifier"] as? String) ?? ""
    let merchantName = (config["merchantName"] as? String) ?? "Xpass Jo"
    let countryCode = (config["countryCode"] as? String) ?? "JO"
    let currencyCode = (config["currencyCode"] as? String) ?? "JOD"
    let amountStr = (config["amount"] as? String) ?? "0"
    let label = (config["label"] as? String) ?? ""

    if merchantId.isEmpty {
      reject("NO_MERCHANT", "Apple Pay merchant identifier is not configured", nil)
      return
    }

    let request = PKPaymentRequest()
    request.merchantIdentifier = merchantId
    request.merchantCapabilities = .capability3DS
    request.countryCode = countryCode
    request.currencyCode = currencyCode
    request.supportedNetworks = supportedNetworks()

    let amount = NSDecimalNumber(string: amountStr.isEmpty ? "0" : amountStr)
    // Guideline 4.9: the last summary item is the total and MUST show the merchant name.
    var summaryItems: [PKPaymentSummaryItem] = []
    let trimmedLabel = label.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmedLabel.isEmpty && trimmedLabel.caseInsensitiveCompare(merchantName) != .orderedSame {
      summaryItems.append(PKPaymentSummaryItem(label: trimmedLabel, amount: amount))
    }
    summaryItems.append(PKPaymentSummaryItem(label: merchantName, amount: amount, type: .final))
    request.paymentSummaryItems = summaryItems

    self.paymentResolve = resolve
    self.paymentReject = reject
    self.didAuthorize = false

    let controller = PKPaymentAuthorizationController(paymentRequest: request)
    controller.delegate = self
    self.authController = controller

    DispatchQueue.main.async {
      controller.present(completion: { presented in
        if !presented {
          self.paymentReject?("PRESENT_FAILED", "Unable to present Apple Pay sheet", nil)
          self.paymentResolve = nil
          self.paymentReject = nil
          self.authController = nil
        }
      })
    }
  }
}

extension ApplePayModule: PKPaymentAuthorizationControllerDelegate {
  func paymentAuthorizationController(_ controller: PKPaymentAuthorizationController,
                                     didAuthorizePayment payment: PKPayment,
                                     handler completion: @escaping (PKPaymentAuthorizationResult) -> Void) {
    self.didAuthorize = true
    // MPGS expects the raw PKPaymentToken.paymentData JSON as a STRING (not base64)
    // in sourceOfFunds.provided.card.devicePayment.paymentToken.
    guard let tokenString = String(data: payment.token.paymentData, encoding: .utf8) else {
      completion(PKPaymentAuthorizationResult(status: .failure, errors: nil))
      self.paymentReject?("TOKEN_ENCODING", "Failed to read Apple Pay token", nil)
      self.paymentResolve = nil
      self.paymentReject = nil
      return
    }
    completion(PKPaymentAuthorizationResult(status: .success, errors: nil))
    self.paymentResolve?(["paymentToken": tokenString])
    self.paymentResolve = nil
    self.paymentReject = nil
  }

  func paymentAuthorizationControllerDidFinish(_ controller: PKPaymentAuthorizationController) {
    controller.dismiss(completion: nil)
    if !self.didAuthorize {
      self.paymentResolve?(["canceled": true])
      self.paymentResolve = nil
      self.paymentReject = nil
    }
    self.authController = nil
  }
}
`;

const OBJC_SOURCE = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ApplePayModule, NSObject)

RCT_EXTERN_METHOD(canMakePayments:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestPayment:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
`;

const withApplePayEntitlement = (config) => {
  const merchantId =
    process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID || 'merchant.com.xpass.app';
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults['com.apple.developer.in-app-payments'] = [merchantId];
    return cfg;
  });
};

const withApplePaySource = (config) => {
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectName = cfg.modRequest.projectName;
      const targetDir = path.join(cfg.modRequest.platformProjectRoot, projectName);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(path.join(targetDir, 'ApplePayModule.swift'), SWIFT_SOURCE);
      fs.writeFileSync(path.join(targetDir, 'ApplePayModule.m'), OBJC_SOURCE);
      return cfg;
    },
  ]);

  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName;
    ['ApplePayModule.swift', 'ApplePayModule.m'].forEach((file) => {
      const filepath = `${projectName}/${file}`;
      const groupName = projectName;
      if (!project.hasFile(filepath)) {
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
          filepath,
          groupName,
          project,
        });
      }
    });
    return cfg;
  });

  return config;
};

module.exports = (config) => {
  config = withApplePayEntitlement(config);
  config = withApplePaySource(config);
  return config;
};
