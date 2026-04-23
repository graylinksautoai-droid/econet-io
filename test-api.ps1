# PowerShell API test
$body = @{
    name = "Test User"
    email = "test@example.com"
    phone = "1234567890"
    address = "123 Test St"
    paymentMethod = "card"
    items = @(
        @{
            id = 1
            name = "Test Product"
            price = 2500
        }
    )
    total = 2500
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/marketplace/checkout" -Method POST -Body $body -ContentType "application/json" -Headers @{"Authorization"="Bearer mock-token-for-testing"}
    Write-Host "Response:"
    $response.Content | ConvertFrom-Json
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
