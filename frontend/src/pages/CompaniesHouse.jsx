import React from 'react';
import { Page, Card, Text, BlockStack, Button, Banner } from '@shopify/polaris';

export default function CompaniesHouse() {
  return (
    <Page
      title="Companies House"
      subtitle="Annual accounts and confirmation statements"
      backAction={{ content: 'Dashboard', url: '/dashboard' }}
    >
      <BlockStack gap="400">
        <Banner title="Prepare your annual accounts" tone="info">
          <p>TaxEase UK prepares micro-entity and small company accounts ready for Companies House filing.</p>
        </Banner>
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">Annual Accounts</Text>
            <Text tone="subdued">Enter your company number to check filing deadlines and prepare accounts.</Text>
            <Button variant="primary">Prepare Accounts</Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
